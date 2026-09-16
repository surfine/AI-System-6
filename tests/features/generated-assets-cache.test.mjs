import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCachedGenerator } from "../../tooling/lib/generated-assets-cache.mjs";
import { buildPreapp, preappGenerators } from "../../tooling/build-preapp.mjs";
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("generated-assets-cache");
const root = mkdtempSync(join(tmpdir(), "ai-system6-assets-cache-"));
try {
  mkdirSync(join(root, "sources"));
  writeFileSync(join(root, "sources/recipe.json"), "first");
  writeFileSync(join(root, "dependency.js"), "dependency one");
  const spec = { name: "example", inputs: ["sources", "dependency.js"], outputs: ["output.txt"] };
  const environment = { BUILD_OPTION: "one" };
  let runs = 0;
  const generate = () => {
    runs += 1;
    writeFileSync(join(root, "output.txt"), `result ${runs}`);
    return 0;
  };
  const execute = (options = {}) => runCachedGenerator(root, spec, generate, { environment, ...options });
  test.assert(!execute().cached && runs === 1, "the first request generates outputs");
  test.assert(execute().cached && runs === 1, "unchanged complete inputs reuse intact outputs");
  writeFileSync(join(root, "sources/recipe.json"), "second");
  test.assert(!execute().cached && runs === 2, "changed recipe bytes regenerate");
  writeFileSync(join(root, "dependency.js"), "dependency two");
  test.assert(!execute().cached && runs === 3, "actual dependency bytes invalidate reuse without a version change");
  writeFileSync(join(root, "sources/new.json"), "new input");
  test.assert(!execute().cached && runs === 4, "new input directory members regenerate");
  rmSync(join(root, "sources/new.json"));
  test.assert(!execute().cached && runs === 5, "removed input directory members regenerate");
  writeFileSync(join(root, "output.txt"), "corrupted output");
  test.assert(!execute().cached && runs === 6, "modified output bytes cannot survive a cache hit");
  rmSync(join(root, "output.txt"));
  test.assert(!execute().cached && runs === 7, "missing output regenerates");
  test.assert(!execute({ environment: { BUILD_OPTION: "two" } }).cached && runs === 8, "changed environment regenerates");
  const receiptPath = join(root, "dist/build-cache/generated-assets/example.json");
  const receipt = readFileSync(receiptPath, "utf8");
  test.assert(!receipt.includes("BUILD_OPTION"), "receipts retain digests rather than environment values");
  writeFileSync(receiptPath, "broken json");
  test.assert(!execute().cached && runs === 9, "malformed receipts regenerate");
  test.assert(!execute({ force: true }).cached && runs === 10, "force runs a generator even with a valid receipt");
  const failed = runCachedGenerator(root, spec, () => 7, { environment, force: true });
  test.assert(failed.status === 7, "failed generation retains its nonzero exit status");
  test.assert(!execute().cached && runs === 11, "failed generation drops the previous successful receipt");
  const mutating = runCachedGenerator(root, spec, () => {
    generate();
    writeFileSync(join(root, "sources/recipe.json"), "edited during build");
    return 0;
  }, { environment, force: true });
  test.assert(mutating.status === 0 && !execute().cached && runs === 13, "input edits during a build never bank a mixed-input result");
  rmSync(join(root, "dependency.js"));
  test.assert(!execute().cached && !execute().cached && runs === 15, "unreadable inputs never bank a receipt even if the generator succeeds");

  // Execute the actual orchestrator against lightweight fixture generators:
  // dependency ordering and early failure are observable, without real assets.
  mkdirSync(join(root, "tooling"));
  const names = ["stream-markdown-vendor", "cmf-renderer-vendor", "embed-vendor", "ai-prompt-files", "bonsai-textures", "bonsai-atlas", "bonsai-renderer-vendor"];
  // A step with no declared inputs runs on every single build, which is how
  // three vendor builders (including the esbuild pass over Three.js) used to
  // cost every ordinary `build:app`. Declaring inputs and outputs is what makes
  // the cache the default rather than the exception.
  const undeclared = preappGenerators(root).filter((entry) => !entry.inputs?.length || !entry.outputs?.length);
  test.assert(
    undeclared.length === 0,
    `every prebuild step declares its inputs and outputs (missing: ${undeclared.map((entry) => entry.name).join(", ") || "none"})`
  );
  for (const entry of preappGenerators(root)) {
    writeFileSync(join(root, entry.script), `import { appendFileSync } from "node:fs"; appendFileSync("order.txt", ${JSON.stringify(`${entry.name}\n`)});\n`);
  }
  test.assert(buildPreapp({ root }) === 0, "the prebuild orchestrator runs fixture generators successfully");
  test.assert(readFileSync(join(root, "order.txt"), "utf8") === `${names.join("\n")}\n`, "direct Node execution preserves all seven dependency steps in order");
  rmSync(join(root, "order.txt"));
  writeFileSync(join(root, preappGenerators(root)[1].script), "process.exit(9);\n");
  test.assert(buildPreapp({ root }) === 9, "a failed generator stops prebuild with its exit status");
  test.assert(readFileSync(join(root, "order.txt"), "utf8") === `${names[0]}\n`, "later generators do not execute after failure");

  // The app bundle and the stylesheets are three kinds of output and are cached
  // as such. One shared digest meant a single application's lazy stylesheet
  // re-ran the JS minification and rewrote every other sheet byte-for-byte.
  const bundleSource = readFileSync(new URL("../../tooling/build-app-bundle.mjs", import.meta.url), "utf8");
  test.assert(
    bundleSource.includes('bundleCacheHit("app-js", jsDigest)')
      && bundleSource.includes('bundleCacheHit("app-css", cssDigest)')
      && bundleSource.includes("bundleCacheHit(`lazy-css-${part.bundle.id}`, part.digest)"),
    "JavaScript, the main stylesheet and each lazy stylesheet decide for themselves"
  );
  test.assert(
    !bundleSource.includes('bundleCacheHit("app", cacheDigest)'),
    "and the one digest that covered all of them is gone"
  );
  test.assert(
    ["app-js", "app-css", "lazy-css-"].every((key) => bundleSource.includes(`markBundleBuilt("${key}`) || bundleSource.includes(`markBundleBuilt(\`${key}`)),
    "each part banks its own success, so a part cannot be skipped on another part's evidence"
  );
  const buildInfoSource = readFileSync(new URL("../../tooling/lib/build-info.mjs", import.meta.url), "utf8");
  test.assert(
    buildInfoSource.includes("if (current === text) return false;")
      && !buildInfoSource.includes('writeFileSync(\n    join(outputRoot, generatedJsPath)'),
    "the generated identity files are not rewritten when their bytes did not change"
  );
  test.assert(
    bundleSource.includes(".staged.js") && bundleSource.includes("renameSync(stagedBundlePath, appBundlePath)"),
    "the bundle is staged and renamed, so a build that cannot parse never replaces the served one"
  );

  // The continuous development entry: one command, the real builder and the
  // real server, and none of the slow release work on the side.
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  test.assert(pkg.scripts.dev === "node tooling/dev-preview.mjs", "npm run dev is the continuous preview entry");
  const devSource = readFileSync(new URL("../../tooling/dev-preview.mjs", import.meta.url), "utf8");
  test.assert(
    devSource.includes("tooling/build-app-bundle.mjs") && devSource.includes("apps/server/server.js"),
    "it reuses the real builder and the real server instead of a second implementation"
  );
  test.assert(
    !/verify:release|verify:ship|playwright|bundle:mac|build:pages/.test(devSource),
    "and it does not run the release, test, packaging or website steps"
  );
  test.assert(
    devSource.includes("app.bundle.js") && devSource.includes("dist") && devSource.includes("watch("),
    "the watcher ignores its own outputs and the build tree"
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
test.finish();
