// Public shared-disk copy: the published disk must not name a listed identity.
//
// The generator stamps app/content/shared-project-disks.js from the raw source
// under internal/, which never ships. Four dtk scraps named a private pseudonym
// listed in internal/agents/pii-patterns.json, so the published module carried
// an identity the owner keeps in internal docs only. The fix is a small pure
// transformation (tooling/lib/public-disk-copy.mjs) applied to the copy BEFORE
// the integrity stamp.
//
// This contract proves the helper on a SYNTHETIC fixture -- the real names are
// never written into a test file, because a test file ships in the public
// snapshot and would leak the very string the gate forbids -- and then proves
// the real generated payload is clean by ASKING THE POLICY (without printing
// the names) and by resealing one bundle through the app's own verifier.
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createFeatureTest, root } from "../helpers/feature-test-harness.mjs";
import { createBackupVm } from "../helpers/backup-vm.mjs";
import { copyWithIdentityReplacements, loadIdentityReplacements } from "../../tooling/lib/public-disk-copy.mjs";
import { SHARED_DISKS, withIntegrity } from "../../tooling/lib/project-disk-integrity.mjs";

const test = createFeatureTest("public-disk-copy");
const runtime = createBackupVm();

// Synthetic stand-ins for a listed identity. They are ASCII words no real name
// contains, so a failure message never names a person and a match here can only
// be the helper's own doing. One carries regex metacharacters (`.`, `*`, `+`,
// `?`) to show the replacement is a literal, not a pattern.
const FIXTURE_NAME = "Real.Name*+?";
const FIXTURE_OTHER = "Someone";
const FIXTURE_REPLACEMENT = "VIP";

// Missing or malformed private policy must fail before a generator can write.
{
  const dir = mkdtempSync(join(tmpdir(), "public-disk-policy-"));
  try {
    const path = join(dir, "policy.json");
    for (const contents of [null, "{", "{}", '{"patterns":[]}', '{"patterns":[{"value":""}]}']) {
      if (contents !== null) writeFileSync(path, contents);
      let rejected = false;
      try { loadIdentityReplacements(path); } catch { rejected = true; }
      test.assert(rejected, "missing or malformed policy refuses publication");
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------- helper ----

test.assert(
  typeof copyWithIdentityReplacements === "function",
  "the public-copy transformation is a pure exported helper",
);

// Nested arrays and string values: the replacement reaches every depth.
{
  const input = {
    project: { name: `article by ${FIXTURE_NAME}`, id: "p1" },
    scraps: [
      { id: "scrap-1", source: { author: FIXTURE_NAME, url: "https://example.invalid/a" } },
      { id: "scrap-2", source: { author: `见 ${FIXTURE_NAME} 的整理` } },
      { id: "scrap-3", source: { author: FIXTURE_OTHER } },
    ],
    tags: [[FIXTURE_NAME, `prefix ${FIXTURE_NAME} suffix`]],
  };
  const out = copyWithIdentityReplacements(input, [
    { value: FIXTURE_NAME, replacement: FIXTURE_REPLACEMENT },
    { value: FIXTURE_OTHER, replacement: FIXTURE_REPLACEMENT },
  ]);
  test.assert(
    out.scraps[0].source.author === FIXTURE_REPLACEMENT,
    "a string value equal to a listed literal is replaced",
  );
  test.assert(
    out.scraps[1].source.author === `见 ${FIXTURE_REPLACEMENT} 的整理`,
    "a listed literal inside surrounding prose is replaced in place",
  );
  test.assert(
    out.scraps[2].source.author === FIXTURE_REPLACEMENT,
    "every listed literal is replaced, not just the first",
  );
  test.assert(
    out.project.name === `article by ${FIXTURE_REPLACEMENT}`,
    "a nested object's string value is replaced",
  );
  test.assert(
    out.tags[0][0] === FIXTURE_REPLACEMENT && out.tags[0][1] === `prefix ${FIXTURE_REPLACEMENT} suffix`,
    "a string inside a nested array is replaced",
  );
}

// Metacharacter literal: `.` and `*` match themselves, never anything.
{
  const out = copyWithIdentityReplacements(
    { a: FIXTURE_NAME, b: "RealXNameY", c: "RealName" },
    [{ value: FIXTURE_NAME, replacement: FIXTURE_REPLACEMENT }],
  );
  test.assert(out.a === FIXTURE_REPLACEMENT, "a literal containing regex metacharacters is replaced exactly");
  test.assert(
    out.b === "RealXNameY" && out.c === "RealName",
    "the metacharacters are not interpreted as wildcards (near-misses are untouched)",
  );
}

// Original is never mutated.
{
  const input = { scraps: [{ source: { author: FIXTURE_NAME } }] };
  copyWithIdentityReplacements(input, [{ value: FIXTURE_NAME, replacement: FIXTURE_REPLACEMENT }]);
  test.assert(
    input.scraps[0].source.author === FIXTURE_NAME,
    "the input bundle is not mutated; the helper returns a deep copy",
  );
}

// Object keys and ids are retained as-is; only string VALUES are rewritten.
{
  const input = { [`${FIXTURE_NAME}-key`]: 1, id: FIXTURE_NAME, nested: { [FIXTURE_NAME]: "kept" } };
  const out = copyWithIdentityReplacements(input, [{ value: FIXTURE_NAME, replacement: FIXTURE_REPLACEMENT }]);
  test.assert(
    Object.keys(out).includes(`${FIXTURE_NAME}-key`) && out.id === FIXTURE_NAME && FIXTURE_NAME in out.nested,
    "object keys and ids are left untouched; only string values change",
  );
  test.assert(out.nested[FIXTURE_NAME] === "kept", "a key that spells a listed literal is not rewritten");
}

// Non-string scalars and empty arrays are preserved.
{
  const input = { n: 0, f: 1.5, b: true, nul: null, empty: [], nestedEmpty: { list: [] }, s: FIXTURE_NAME };
  const out = copyWithIdentityReplacements(input, [{ value: FIXTURE_NAME, replacement: FIXTURE_REPLACEMENT }]);
  test.assert(
    out.n === 0 && out.f === 1.5 && out.b === true && out.nul === null,
    "non-string scalars pass through unchanged",
  );
  test.assert(
    Array.isArray(out.empty) && out.empty.length === 0 && Array.isArray(out.nestedEmpty.list) && out.nestedEmpty.list.length === 0,
    "empty arrays stay empty arrays",
  );
  test.assert(out.s === FIXTURE_REPLACEMENT, "the one string that matched is replaced");
}

// ------------------------------------------------- resealed backup verifies --
// The published bundle must still pass the app's own import check. Sanitize a
// synthetic backup, stamp it with the real withIntegrity rule, and hand it to
// the actual verifier -- the same one the Import Utility runs -- not to a
// hand-rolled hash comparison.
{
  const raw = {
    format: "ai-system-6-project-disk",
    version: 1,
    exportedAt: "2026-09-16T00:00:00.000Z",
    project: { id: "p1", name: `稿子 by ${FIXTURE_NAME}` },
    folders: [],
    files: [],
    scraps: [
      { id: "scrap-1", projectId: "p1", text: "引用", source: { author: FIXTURE_NAME } },
    ],
    trash: [],
    projectCdItems: [],
    references: [],
    documentRevisions: [],
    darkroomRecords: [],
    imageAttachments: [],
  };
  const sanitized = copyWithIdentityReplacements(raw, [{ value: FIXTURE_NAME, replacement: FIXTURE_REPLACEMENT }]);
  const sealed = withIntegrity(sanitized);
  const integrity = await runtime.backup.verifyIntegrity(sealed);
  test.assert(
    integrity.valid === true,
    integrity.valid === true
      ? "a sanitized bundle resealed through withIntegrity is accepted by the app's own verifier"
      : `sanitized+resealed bundle would be refused: ${integrity.errors.join("; ")}`,
  );
  test.assert(
    sealed.scraps[0].source.author === FIXTURE_REPLACEMENT,
    "the resealed bundle still carries the pseudonym, not the listed literal",
  );
}

// --------------------------------------------------- real generated output --
// The shipped module and the shipped index must both be clean. The policy is
// read here and only its NAMES are used as needles; the needles are never
// printed, and a match reports only WHERE it was found.
const policyPath = fileURLToPath(new URL("../../internal/agents/pii-patterns.json", import.meta.url));
const policyNames = existsSync(policyPath)
  ? loadIdentityReplacements(policyPath).map((entry) => entry.value)
  : []; // A public clone omits the private policy; the synthetic tests still run.

if (policyNames.length) {
  const payloadSource = readFileSync(
    fileURLToPath(new URL("../../apps/desktop/app/content/shared-project-disks.js", import.meta.url)),
    "utf8",
  );
  const indexSource = readFileSync(
    fileURLToPath(new URL("../../apps/desktop/app/content/shared-project-disks-index.js", import.meta.url)),
    "utf8",
  );
  for (const name of policyNames) {
    test.assert(
      !payloadSource.includes(name),
      "the generated shared-project-disks.js contains no listed identity name",
    );
    test.assert(
      !indexSource.includes(name),
      "the generated shared-project-disks-index.js contains no listed identity name",
    );
  }

  // Every one of the 35 bundles must still validate through the real verifier.
  // The module assigns a JSON object to a window global; pull that object out
  // the same way the launch path does, then verify each route's backup.
  const assignment = "window.AISystem6SharedProjectDisks = ";
  const body = payloadSource.slice(payloadSource.indexOf(assignment) + assignment.length);
  const disks = JSON.parse(body.slice(0, body.indexOf(";\n")));
  const routes = Object.keys(disks);
  test.assert(routes.length === 35, `all 35 shared disks are present in the payload (${routes.length})`);
  let refused = [];
  for (const route of routes) {
    // eslint-disable-next-line no-await-in-loop
    const verdict = await runtime.backup.verifyIntegrity(disks[route]);
    if (verdict.valid !== true) refused.push(`${route}: ${verdict.errors.join("; ")}`);
  }
  test.assert(refused.length === 0, refused.length === 0
    ? "all 35 published bundles validate through the app's own verifier"
    : `published bundles would be refused by the importer: ${refused.join(" | ")}`);

  // The registry names the same routes the payload carries.
  test.assert(
    routes.join(",") === SHARED_DISKS.map((disk) => disk.route).join(","),
    "the generated payload carries exactly the registered routes",
  );
} else {
  test.assert(true, "public copy: no internal identity policy, so there is nothing to detect by design");
}

test.finish();
