// Time Machine's ad-blocking lists reach the release payload.
//
// 20261008.2 shipped the browse origin to the VPS with no lists: a frozen
// release tree runs no prebuild, apps/browse/filters is git-ignored, so the
// engine answered 404 for both files and blocked nothing. A release now
// compiles the lists from the pinned download in .cache/ubol (never the
// network), refuses to build without it, and the payload check refuses lists
// that are missing, empty or from another release. The compiled lists are then
// loaded into the engine's own matcher to show they block what they should.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { createFeatureTest, root } from "../helpers/feature-test-harness.mjs";
import {
  compileBrowseFiltersForRelease,
  pinnedUbolVersion,
  releaseBrowseFilterProblems,
} from "../../tooling/lib/browse-filters-release.mjs";

const test = createFeatureTest("browse-filters-release");
const pin = pinnedUbolVersion(root);
const scratch = mkdtempSync(join(tmpdir(), "ais6-filters-release-"));

function treeWithPin(name) {
  const tree = join(scratch, name);
  mkdirSync(join(tree, "vendor/ubol"), { recursive: true });
  cpSync(join(root, "vendor/ubol/PIN.json"), join(tree, "vendor/ubol/PIN.json"));
  return tree;
}

try {
  // A frozen tree without the pinned download: the release stops, offline.
  const bare = treeWithPin("bare");
  let refusal = "";
  try {
    compileBrowseFiltersForRelease(bare);
  } catch (error) {
    refusal = String(error?.message || error);
  }
  test.assert(refusal.includes(pin) && refusal.includes("browse:fetch-filters"), "a tree without the pinned uBlock Origin Lite download refuses to build and says how to get it");
  test.assert(!existsSync(join(bare, ".cache")) && !existsSync(join(bare, "apps/browse/filters")), "the refusal fetches nothing and writes no empty lists");

  // A frozen tree with the download (the fixture rulesets stand in for it).
  const carried = treeWithPin("carried");
  cpSync(join(root, "tests/fixtures/browse-filters"), join(carried, ".cache/ubol", pin, "chromium"), { recursive: true });
  test.assert(compileBrowseFiltersForRelease(carried) === pin, "the carried download compiles into apps/browse/filters");
  test.assert(releaseBrowseFilterProblems(carried, pin).length === 0, "the compiled lists pass the payload check");

  // The payload check, on a release directory.
  const release = join(scratch, "release");
  cpSync(join(carried, "apps/browse/filters"), join(release, "apps/browse/filters"), { recursive: true });
  test.assert(releaseBrowseFilterProblems(release, pin).length === 0, "a web release carrying both lists passes");
  const missing = join(scratch, "missing");
  mkdirSync(join(missing, "apps/browse"), { recursive: true });
  test.assert(releaseBrowseFilterProblems(missing, pin).length === 2, "a web release with no lists fails once per list");
  const empty = join(scratch, "empty");
  cpSync(release, empty, { recursive: true });
  writeFileSync(join(empty, "apps/browse/filters/network.json"), JSON.stringify({ v: pin, r: [] }));
  test.assert(releaseBrowseFilterProblems(empty, pin).some((problem) => problem.includes("holds no rules")), "an empty network list fails");
  test.assert(releaseBrowseFilterProblems(release, "2000.1.1").length === 2, "lists from another uBlock Origin Lite release fail");

  // The shipped lists, in the engine's own matcher.
  const context = { self: {} };
  vm.createContext(context);
  vm.runInContext(readFileSync(join(root, "apps/browse/filter-match.js"), "utf8"), context);
  const filters = context.self.AIS6Filters;
  const network = filters.compileNetwork(JSON.parse(readFileSync(join(release, "apps/browse/filters/network.json"), "utf8")));
  const ad = "https://ads.example.com/x.js";
  test.assert(filters.matchNetwork(network, { url: ad, hostname: "ads.example.com", type: "script", initiatorHost: "page.example", thirdParty: true }), "the released network list blocks an ad host in the engine's matcher");
  const cosmetic = JSON.parse(readFileSync(join(release, "apps/browse/filters/cosmetic.json"), "utf8"));
  test.assert(filters.cosmeticCss(cosmetic, "sub.example.com").includes("display:none!important"), "the released cosmetic list hides a site's ad elements");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

// Both packagers compile before they copy apps/browse, and the web payload
// check reads the lists it is about to ship.
const webBuild = readFileSync(join(root, "tooling/build-web-release.mjs"), "utf8");
test.assert(
  webBuild.indexOf("compileBrowseFiltersForRelease(repositoryRoot)") > 0
    && webBuild.indexOf("compileBrowseFiltersForRelease(repositoryRoot)") < webBuild.indexOf("for (const relative of runtimeDirectories) await copyDirectory"),
  "the web release compiles the lists before it copies apps/browse",
);
const macBuild = readFileSync(join(root, "tooling/build-mac-server-payload.mjs"), "utf8");
test.assert(
  macBuild.indexOf("compileBrowseFiltersForRelease(repoRoot)") > 0
    && macBuild.indexOf("compileBrowseFiltersForRelease(repoRoot)") < macBuild.indexOf('"apps/browse", "package.json"'),
  "the Mac payload compiles the lists before it copies apps/browse",
);
test.assert(
  readFileSync(join(root, "tooling/verify-web-release-safety.mjs"), "utf8").includes("releaseBrowseFilterProblems(options.release"),
  "the web release safety gate checks the lists in the payload",
);

test.finish();
