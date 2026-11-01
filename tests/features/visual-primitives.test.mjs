import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { root } from "../helpers/feature-test-harness.mjs";

const output = mkdtempSync(join(tmpdir(), "ais6-control-proof-"));
try {
  const result = spawnSync(process.execPath, ["tooling/verify-liquid-shapes.mjs", "--primitives", "--self-test", "--output", output], {
    cwd: root, encoding: "utf8", timeout: 60000,
  });
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  const report = JSON.parse(readFileSync(join(output, readdirSync(output)[0], "report.json"), "utf8"));
  assert.deepEqual(report.failures, []);
  assert.equal(report.selfTests.length, 6);
  assert.ok(report.selfTests.every(proof => proof.rejected), "each historical defect must trip the same browser checks used by CSS verification");
  assert.equal(new Set(report.checks.filter(check => check.scene.startsWith("select:")).map(check => check.scene.split(":")[1])).size, 6);
  console.log("OK  shared-control gate rejects duplicate/missing arrows, font drift, hidden native ink and square glass");
} finally {
  rmSync(output, { recursive: true, force: true });
}
