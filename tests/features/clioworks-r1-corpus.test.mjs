// ClioWorks R1 contract: the real-file corpus gate. Runs tooling/clioworks-r1-corpus.mjs in
// compare mode (open, untouched save byte-identical, one edit still a valid package; every
// docx/xlsx/pptx through the desk's own adapters) and fails only on a REGRESSION against
// tests/fixtures/real-corpus/baseline.json. It also holds the fixtures still (sha256 from the
// manifest) and requires a licence and a source for every file. LibreOffice and the
// Microsoft 365 half are not part of this contract (see the README next to the corpus).
import vm from "node:vm";
import { existsSync, readFileSync } from "node:fs";
import { loadScripts, makeContext } from "../fixtures/clioworks-s11/vm-context.mjs";
import { join } from "node:path";
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { BASELINE, CORPUS, readManifest, regressions, runCorpus, sha256 } from "../../tooling/clioworks-r1-corpus.mjs";

const test = createFeatureTest("clioworks-r1-corpus");

// Every codec file the three adapters load, named here so a change to any of them selects this
// contract (tooling/select-feature-contracts.mjs follows mentions). The gate exists to catch codec
// regressions on real files; without these names a change to quire/layout.js ran no contract at all.
const GUARDED = [
  "apps/desktop/app/vendor/vibeoffice/common/zip.js",
  "apps/desktop/app/vendor/vibeoffice/common/sha.js",
  "apps/desktop/app/vendor/vibeoffice/common/core.js",
  "apps/desktop/app/vendor/vibeoffice/common/xml.js",
  "apps/desktop/app/vendor/vibeoffice/common/opc.js",
  "apps/desktop/app/vendor/vibeoffice/common/opc-order.js",
  "apps/desktop/app/vendor/vibeoffice/common/crypto.js",
  "apps/desktop/app/vendor/vibeoffice/common/geometry.js",
  "apps/desktop/app/vendor/vibeoffice/common/metafile.js",
  "apps/desktop/app/vendor/vibeoffice/common/numfmt.js",
  "apps/desktop/app/vendor/vibeoffice/common/charts.js",
  "apps/desktop/app/vendor/vibeoffice/common/dml.js",
  "apps/desktop/app/vendor/vibeoffice/ledger/xml.js",
  "apps/desktop/app/vendor/vibeoffice/quire/dmodel.js",
  "apps/desktop/app/vendor/vibeoffice/quire/ops.js",
  "apps/desktop/app/vendor/vibeoffice/quire/omml.js",
  "apps/desktop/app/vendor/vibeoffice/quire/render.js",
  "apps/desktop/app/vendor/vibeoffice/quire/portions.js",
  "apps/desktop/app/vendor/vibeoffice/quire/preserve.js",
  "apps/desktop/app/vendor/vibeoffice/quire/preserve-drawing.js",
  "apps/desktop/app/vendor/vibeoffice/quire/docx-read.js",
  "apps/desktop/app/vendor/vibeoffice/quire/docx-write.js",
  "apps/desktop/app/vendor/vibeoffice/quire/layout.js",
  "apps/desktop/app/vendor/vibeoffice/quire/drawing.js",
  "apps/desktop/app/vendor/vibeoffice/quire/editor.js",
  "apps/desktop/app/vendor/vibeoffice/quire/fields.js",
  "apps/desktop/app/vendor/clioworks-v3/quire-adapter.js",
  "apps/desktop/app/vendor/vibeoffice/ledger/formula.js",
  "apps/desktop/app/vendor/vibeoffice/ledger/model.js",
  "apps/desktop/app/vendor/vibeoffice/ledger/preserve.js",
  "apps/desktop/app/vendor/vibeoffice/ledger/extensions.js",
  "apps/desktop/app/vendor/vibeoffice/ledger/pivots.js",
  "apps/desktop/app/vendor/vibeoffice/ledger/threads.js",
  "apps/desktop/app/vendor/vibeoffice/ledger/objects.js",
  "apps/desktop/app/vendor/vibeoffice/ledger/slicers.js",
  "apps/desktop/app/vendor/vibeoffice/ledger/tables.js",
  "apps/desktop/app/vendor/vibeoffice/ledger/xchart.js",
  "apps/desktop/app/vendor/vibeoffice/ledger/xlsx-read.js",
  "apps/desktop/app/vendor/vibeoffice/ledger/xlsx-write.js",
  "apps/desktop/app/vendor/vibeoffice/ledger/calc.js",
  "apps/desktop/app/vendor/vibeoffice/ledger/fn-core.js",
  "apps/desktop/app/vendor/vibeoffice/ledger/fn-lookup.js",
  "apps/desktop/app/vendor/vibeoffice/ledger/fn-stat.js",
  "apps/desktop/app/vendor/vibeoffice/ledger/fn-fin.js",
  "apps/desktop/app/vendor/vibeoffice/ledger/fn-eng.js",
  "apps/desktop/app/vendor/clioworks-v3/ledger-adapter.js",
  "apps/desktop/app/vendor/clioworks-v3/ledger-structure.js",
  "apps/desktop/app/vendor/vibeoffice/lectern/model.js",
  "apps/desktop/app/vendor/vibeoffice/lectern/comments.js",
  "apps/desktop/app/vendor/vibeoffice/lectern/designs.js",
  "apps/desktop/app/vendor/vibeoffice/lectern/frames.js",
  "apps/desktop/app/vendor/vibeoffice/lectern/properties.js",
  "apps/desktop/app/vendor/vibeoffice/lectern/slideshow.js",
  "apps/desktop/app/vendor/vibeoffice/lectern/preserve.js",
  "apps/desktop/app/vendor/vibeoffice/lectern/pptx-read.js",
  "apps/desktop/app/vendor/vibeoffice/lectern/pptx-write.js",
  "apps/desktop/app/vendor/clioworks-v3/lectern-adapter.js",
];
const adapterModules = new Set();
for (const app of ["quire", "ledger", "lectern"]) {
  const adapter = `apps/desktop/app/vendor/clioworks-v3/${app}-adapter.js`;
  adapterModules.add(adapter);
  for (const match of readFileSync(adapter, "utf8").matchAll(/["'](app\/vendor\/[^"']+\.js)["']/g)) adapterModules.add(`apps/desktop/${match[1]}`);
}
const missing = [...adapterModules].filter((path) => !GUARDED.includes(path));
const stale = GUARDED.filter((path) => !adapterModules.has(path));
test.assert(!missing.length && !stale.length, `GUARDED lists exactly the adapters' modules${missing.length ? `; add: ${missing.join(", ")}` : ""}${stale.length ? `; remove: ${stale.join(", ")}` : ""}`);

// Each adapter, loaded on its own in a fresh VM, must come up and expose open(): the codec
// files GUARDED names really load, not just exist.
for (const [file, globalName] of [["quire-adapter.js", "ClioWorksQuireAdapter"], ["ledger-adapter.js", "ClioWorksLedgerAdapter"], ["lectern-adapter.js", "ClioWorksLecternAdapter"]]) {
  const ctx = makeContext();
  loadScripts(ctx, [`app/vendor/clioworks-v3/${file}`]);
  test.assert(vm.runInContext(`typeof ${globalName}?.open`, ctx) === "function", `${file} loads in a fresh VM and exposes ${globalName}.open`);
}

const run = async () => {
  const manifest = readManifest();
  test.assert(manifest.length === 32, "the manifest lists the 32 corpus files");
  for (const entry of manifest) {
    const path = join(CORPUS, entry.file.split(".").pop(), entry.file);
    const present = existsSync(path);
    test.assert(present, `${entry.id}: ${entry.file} exists`);
    if (present) test.assert(sha256(readFileSync(path)) === entry.sha256, `${entry.id}: ${entry.file} still has its recorded sha256 (fixtures never silently change)`);
    test.assert(typeof entry.license === "string" && entry.license.length > 8, `${entry.id}: a licence is recorded`);
    test.assert(typeof entry.url === "string" && /^https?:\/\//.test(entry.url) && typeof entry.source_page === "string" && entry.source_page.length > 0, `${entry.id}: url and source_page are recorded`);
  }

  test.assert(existsSync(BASELINE), "baseline.json exists (node tooling/clioworks-r1-corpus.mjs --write-baseline)");
  const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
  const rows = await runCorpus({});
  test.assert(rows.length === manifest.length && baseline.files.length === manifest.length, "every manifest file has a result and a baseline row");
  for (const row of rows) {
    if (row.id.startsWith("F")) test.assert(row.pending === "N1", `${row.id}: PDF is recorded as pending N1 only`);
    else test.assert(typeof row.open === "boolean" && typeof row.untouched_identical === "boolean" && typeof row.edited_valid === "boolean", `${row.id}: all three checks produced a verdict`);
  }
  const bad = regressions(rows, baseline);
  test.assert(bad.length === 0, `no regression against the baseline${bad.length ? `:\n  ${bad.join("\n  ")}` : ""}`);

  test.finish();
};

run();
