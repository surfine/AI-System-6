// Startup Recovery reads project data directly from IndexedDB and produces a
// REAL verified Project Backup — same assembler, same validator, same schema
// as the normal export. Even when the desktop runtime never loaded, the
// Recovery panel can list projects and export a verified backup.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { createBackupVm, seedComplexProject } from "../helpers/backup-vm.mjs";

const test = createFeatureTest("recovery-storage");
const recoverySource = read("app/core/recovery-storage.js");

// Disaster scenario: no desktop runtime globals at all, IndexedDB has two
// projects; Recovery lists them and exports a REAL verified backup with every
// durable collection populated.
{
  const seed = seedComplexProject();
  const runtime = createBackupVm(seed);
  const projects = await runtime.recovery.listRecoverableProjects();
  test.assert(projects.length === 1 && projects[0].name === "Integrity Article", "Recovery lists projects straight from IndexedDB");
  const bundle = await runtime.recovery.exportRecoveryProjectBackup("p1");
  test.assert(bundle !== null, "Recovery exports the project without mounting it");
  test.assert(bundle.folders.length === 2, "Recovery backup contains folders");
  test.assert(bundle.files.length === 3, "Recovery backup contains files (including the alias)");
  test.assert(bundle.scraps.length === 2, "Recovery backup contains scraps");
  test.assert(bundle.trash.length === 1, "Recovery backup contains trash");
  test.assert(bundle.projectCdItems.length === 1, "Recovery backup contains Project CD items");
  test.assert(bundle.references.length === 1 && bundle.references[0].chunks.length === 1, "Recovery backup contains references with their chunks");
  test.assert(bundle.documentRevisions.length === 2, "Recovery backup contains document revisions");
  const verified = await runtime.backup.verifyIntegrity(bundle);
  const validation = runtime.backup.validateBackup(bundle);
  test.assert(verified.valid === true, "the exported bundle passes real integrity verification");
  test.assert(validation.valid === true, "the exported bundle passes real structural validation");
}

// The recovery layer still refuses unknown projects.
{
  const runtime = createBackupVm({ projects: [{ id: "p1", name: "Only" }] });
  const bundle = await runtime.recovery.exportRecoveryProjectBackup("missing");
  test.assert(bundle === null, "exporting an unknown project returns null");
}

// Recovery is independent of the desktop runtime.
test.assertNotIncludes(recoverySource, "handleAction(", "recovery-storage never depends on the action router");
test.assertNotIncludes(recoverySource, "renderProjectDisks", "recovery-storage never depends on the desktop");
test.assertIncludes(recoverySource, "AISystem6ProjectBackupAssembler", "Recovery uses the shared backup assembler");
test.assertIncludes(recoverySource, "referenceStoreName", "Recovery reads references from their real store");
test.assertIncludes(recoverySource, "settings?.projectCdItems", "Recovery reads Project CD items from the real settings source");

test.finish();
