// The prebuild step for Time Machine's ad blocking: make sure the pinned
// uBlock Origin Lite release is fetched and verified, then compile its lists
// into apps/browse/filters. Without network or without the release the build
// goes on: the web engine works the same, it just blocks nothing.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { repositoryRoot } from "./lib/paths.mjs";

const pin = JSON.parse(readFileSync(join(repositoryRoot, "vendor/ubol/PIN.json"), "utf8"));
const source = join(repositoryRoot, ".cache", "ubol", pin.version, "chromium");

if (!existsSync(join(source, "rulesets"))) {
  const fetched = spawnSync(process.execPath, [join(repositoryRoot, "tooling/browse/fetch-ubol.mjs")], { stdio: "inherit" });
  if (fetched.status !== 0 || !existsSync(join(source, "rulesets"))) {
    console.warn(`browse filters: uBlock Origin Lite ${pin.version} is not available; Time Machine's web engine will not block ads in this build.`);
    process.exit(0);
  }
}

const built = spawnSync(process.execPath, [
  join(repositoryRoot, "tooling/browse/build-filters.mjs"),
  "--source", source,
  "--out", join(repositoryRoot, "apps/browse/filters"),
], { stdio: "inherit" });
process.exit(built.status ?? 1);
