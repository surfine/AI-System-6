import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import {
  AUDIT_SCHEMA_VERSION,
  CORE_VIEWPORTS,
  MANUAL_ONLY_CAPABILITIES,
  buildAuditMatrix,
  classifyWindowOpen,
  createContextOptions,
  createNotTestedProof,
  productionSurfaceContracts,
  validateBrowserFindingsDocument,
  validateCoverageMatrixDocument,
} from "../../tooling/hig-browser-audit.mjs";

const test = createFeatureTest("hig-browser-audit");
const runnerSource = read("tooling/hig-browser-audit.mjs");

test.assertIncludes(runnerSource, "dismissAuditBlockingDialogs", "the runner clears audit-owned modal state between surfaces");
test.assertIncludes(runnerSource, "#system-modal-cancel", "modal cleanup uses the explicit Cancel control instead of accepting arbitrary dialogs");
test.assertNotIncludes(runnerSource, ".accept()", "the runner never generically accepts a dialog while collecting failure evidence");

const smoke = buildAuditMatrix("smoke");
const core = buildAuditMatrix("core");
const full = buildAuditMatrix("full");

test.assert(CORE_VIEWPORTS.length === 4, "the core matrix owns the four phone/tablet portrait/landscape viewports");
test.assert(core.length === 16, "the core matrix crosses four viewports with English/Chinese and Classic/Liquid Glass");
test.assert(new Set(core.map(({ id }) => id)).size === core.length, "every core environment id is unique");
test.assert(smoke.length === 4, "the smoke matrix samples every core viewport once");
test.assert(new Set(smoke.map(({ language }) => language)).size === 2, "the smoke matrix covers English and Chinese");
test.assert(new Set(smoke.map(({ theme }) => theme)).size === 2, "the smoke matrix covers Classic and Liquid Glass");
test.assert(full.length > core.length, "the full matrix adds breakpoint, multitasking, reduced-motion, and text stress probes");

for (const width of [759, 760, 761, 819, 820, 859, 860, 861]) {
  test.assert(full.some(({ viewport }) => viewport.width === width), `the full matrix probes the ${width}px responsive seam`);
}
for (const width of [320, 375, 600, 744, 820, 1024]) {
  test.assert(full.some(({ id }) => id.startsWith(`ipad-multitask-${width}-`)), `the full matrix probes the ${width}px iPad multitasking width`);
}

for (const environment of core) {
  const context = createContextOptions(environment);
  test.assert(context.hasTouch === true, `${environment.id} explicitly enables touch input`);
  test.assert(context.isMobile === true, `${environment.id} explicitly enables mobile browser behavior`);
  test.assert(context.viewport.width === environment.viewport.width && context.viewport.height === environment.viewport.height, `${environment.id} preserves its viewport in the browser context`);
}

const surfaces = productionSurfaceContracts();
test.assert(!surfaces.some(({ name }) => name === "themeLab"), "Theme Lab remains an evidence bench rather than a production audit surface");
// These two were the audit's own finding when it was written: built by their
// modules, absent from the interface registry, so the runner carried
// hand-written contracts marked "missing". Both have real contracts now, which
// is the finding having been acted on -- so the claim worth holding is that
// they are registered, not that they are still orphans.
for (const name of ["imagePromptStudio", "sideAskPad"]) {
  const surface = surfaces.find((entry) => entry.name === name);
  test.assert(!!surface, `${name} is a production audit surface`);
  test.assert(surface?.contract.registryStatus === "registered", `${name} has a real interface contract rather than a stand-in`);
}
test.assert(
  surfaces.every(({ contract }) => contract.registryStatus === "registered"),
  "no audited surface is running on a hand-written stand-in contract",
);

const hiddenExisting = classifyWindowOpen({ surfaceFound: true, visible: false, entryAttempted: false });
test.assert(hiddenExisting.status === "not-tested" && hiddenExisting.reason === "no-real-user-entry-found", "a hidden DOM node never counts as a tested interaction without a real entry");
const failedEntry = classifyWindowOpen({ surfaceFound: true, visible: false, entryAttempted: true, entryKind: "control-click" });
test.assert(failedEntry.status === "not-tested" && failedEntry.reason === "real-user-entry-did-not-open-surface", "an entry click that leaves the surface hidden is not-tested rather than pass");
const opened = classifyWindowOpen({ surfaceFound: true, visible: true, entryAttempted: true, entryKind: "finder-double-click", active: true });
test.assert(opened.status === "tested" && opened.active === true, "a real entry plus visible active surface is tested");

const manualCapabilities = MANUAL_ONLY_CAPABILITIES.map((capability) => ({
  ...capability,
  status: "not-tested",
  proof: { execution: "manual-required", environment: "real-device-required", conclusion: "not-tested" },
}));
const sampleCoverage = {
  schemaVersion: AUDIT_SCHEMA_VERSION,
  kind: "ai-system-6-hig-coverage-matrix",
  generatedAt: "2026-08-20T00:00:00.000Z",
  source: { sourceCommit: "sample" },
  environments: [core[0]],
  records: [{
    id: "chromium:sample:finder",
    surface: { name: "finder" },
    environmentId: core[0].id,
    proof: createNotTestedProof("sample coverage gap"),
  }],
  manualCapabilities,
};
const validCoverage = validateCoverageMatrixDocument(sampleCoverage);
test.assert(validCoverage.valid, `the sample coverage document matches the schema${validCoverage.errors.length ? `: ${validCoverage.errors.join(", ")}` : ""}`);

const invalidManualPass = structuredClone(sampleCoverage);
invalidManualPass.manualCapabilities[0].status = "passed";
invalidManualPass.manualCapabilities[0].proof.conclusion = "pass";
test.assert(!validateCoverageMatrixDocument(invalidManualPass).valid, "safe-area/keyboard/VoiceOver-style manual capabilities cannot be marked pass");

const invalidNotTested = structuredClone(sampleCoverage);
invalidNotTested.records[0].proof.reason = "";
test.assert(!validateCoverageMatrixDocument(invalidNotTested).valid, "not-tested coverage requires an explicit reason");

const sampleFindings = {
  schemaVersion: AUDIT_SCHEMA_VERSION,
  kind: "ai-system-6-hig-browser-findings",
  generatedAt: "2026-08-20T00:00:00.000Z",
  source: { sourceCommit: "sample" },
  findings: [{
    id: "HIG-SAMPLE-1",
    severity: "P2",
    confidence: "High",
    expected: "Expected behavior.",
    actual: "Observed behavior.",
    impact: "User impact.",
    reproduction: ["Repeat the sample."],
    evidence: ["coverage-matrix.json#/records/sample"],
    recommendedFix: "Fix the owner.",
    verification: "Repeat the measurement.",
  }],
};
const validFindings = validateBrowserFindingsDocument(sampleFindings);
test.assert(validFindings.valid, `the sample findings document matches the schema${validFindings.errors.length ? `: ${validFindings.errors.join(", ")}` : ""}`);
const missingEvidence = structuredClone(sampleFindings);
missingEvidence.findings[0].evidence = [];
test.assert(!validateBrowserFindingsDocument(missingEvidence).valid, "every browser finding requires concrete evidence");

test.finish();
