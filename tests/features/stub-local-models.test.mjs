// Capture tools take local models out of the picture through one helper.
// A stub on LM Studio's and Ollama's ports alone stubs nothing — the desk asks
// this app's server, which asks them — so captures followed whatever the
// build machine's shared LM Studio had loaded (2026-10-09: the token tables'
// `.btn` multisets moved between two runs of one tree, and a site frame named
// a real local model in its menu bar).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createFeatureTest, root } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("stub-local-models");
const helper = readFileSync(join(root, "tooling/lib/stub-local-models.mjs"), "utf8");
test.assertIncludes(helper, "/\\/api\\/v1\\/models(?:\\?|$)/", "the helper answers the server's LM Studio model list, the route the desk actually calls");
test.assertIncludes(helper, "/\\/api\\/models(?:\\?|$)/", "the helper answers the server's model discovery route");

const portOnly = /\.route\(\/https\?:\\\/\\\/\(\?:127\\\.0\\\.0\\\.1\|localhost\):\(\?:1234\|11434\)/;
const offenders = readdirSync(join(root, "tooling"))
  .filter((name) => name.endsWith(".mjs"))
  .filter((name) => portOnly.test(readFileSync(join(root, "tooling", name), "utf8")));
test.assert(offenders.length === 0, `capture tools stub local models through tooling/lib/stub-local-models.mjs, not a port-only route (found in: ${offenders.join(", ") || "none"})`);
for (const tool of ["appearance-token-check.mjs", "appearance-snapshot.mjs", "capture-site-frames.mjs"]) {
  test.assertIncludes(readFileSync(join(root, "tooling", tool), "utf8"), "await stubLocalModels(", `${tool} stubs local models through the shared helper`);
}
test.finish();
