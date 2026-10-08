// Time Machine's ad-blocking lists in a release payload.
//
// apps/browse/filters/ is generated and git-ignored, and a frozen release tree
// never runs the prebuild step that writes it (verify:release calls the bundle
// builder directly, the npm install is cloned, and the other generated vendor
// files are committed). 20261008.2 therefore reached the VPS with no lists at
// all: the browse origin answered 404 for both files and blocked nothing.
//
// A release compiles the lists itself, from the pinned uBlock Origin Lite
// download in .cache/ubol only. It never fetches: the frozen tree must build
// the same rules every time, and a missing cache fails the release instead of
// shipping an engine with empty lists. The payload check then reads the files
// it is about to ship and refuses lists that are absent, empty or from a
// different pinned release.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const toolingRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const BROWSE_FILTER_FILES = Object.freeze(["network.json", "cosmetic.json"]);
export const BROWSE_FILTERS_RELATIVE = "apps/browse/filters";

export function pinnedUbolVersion(root) {
  return JSON.parse(readFileSync(path.join(root, "vendor/ubol/PIN.json"), "utf8")).version;
}

/**
 * Compile apps/browse/filters under `root` from root/.cache/ubol/<pin>/chromium.
 * Throws when the pinned download is not there; never touches the network.
 */
export function compileBrowseFiltersForRelease(root) {
  const version = pinnedUbolVersion(root);
  const source = path.join(root, ".cache", "ubol", version, "chromium");
  if (!existsSync(path.join(source, "rulesets"))) {
    throw new Error(
      `Time Machine's ad-blocking lists cannot be built: the pinned uBlock Origin Lite ${version} is not in `
      + `${path.relative(root, source) || source}. Run npm run browse:fetch-filters in the working tree; `
      + "the release preflight carries .cache/ubol/ into the frozen tree from there.",
    );
  }
  const built = spawnSync(process.execPath, [
    path.join(toolingRoot, "browse", "build-filters.mjs"),
    "--source", source,
    "--out", path.join(root, BROWSE_FILTERS_RELATIVE),
  ], { encoding: "utf8" });
  if (built.status !== 0) {
    throw new Error(`Time Machine's ad-blocking lists failed to compile:\n${built.stderr || built.stdout}`);
  }
  return assertReleaseBrowseFilters(root, version);
}

/** Every reason the lists under `directory` are not shippable; empty when they are. */
export function releaseBrowseFilterProblems(directory, version) {
  const problems = [];
  for (const name of BROWSE_FILTER_FILES) {
    const file = path.join(directory, BROWSE_FILTERS_RELATIVE, name);
    const label = `${BROWSE_FILTERS_RELATIVE}/${name}`;
    if (!existsSync(file)) {
      problems.push(`${label} is missing`);
      continue;
    }
    let list;
    try {
      list = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      problems.push(`${label} is not JSON`);
      continue;
    }
    if (version && list?.v !== version) {
      problems.push(`${label} was compiled from uBlock Origin Lite ${list?.v || "(unknown)"}, not the pinned ${version}`);
    }
    const entries = name === "network.json" ? list?.r : list?.h;
    const count = Array.isArray(entries) ? entries.length : Object.keys(entries || {}).length;
    if (!count) problems.push(`${label} holds no rules`);
  }
  return problems;
}

export function assertReleaseBrowseFilters(directory, version) {
  const problems = releaseBrowseFilterProblems(directory, version);
  if (problems.length) throw new Error(`Time Machine's ad-blocking lists are not shippable:\n- ${problems.join("\n- ")}`);
  return version;
}
