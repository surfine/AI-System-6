/**
 * The release checkpoint bank: per-step outcomes a retried release can spend
 * instead of re-paying.
 *
 * It is an EXPERIMENT and it is unsound as it stands. A banked step is skipped,
 * but a step's outputs live in trees the orchestrator recreates for every run —
 * the frozen worktree under /tmp, the mkdtemp staging directory, the snapshot
 * build directory. Reuse a build step and the steps after it lose their inputs:
 * release-prepare's copyInto() refuses with "Expected release artifact is
 * missing", so the retry the bank exists to accelerate fails instead.
 *
 * Enabling it is therefore a deliberate, acknowledged act rather than one
 * environment variable, the way ad-hoc signing is. Making it sound needs one of:
 * bank each step's declared outputs and restore them into the new tree on reuse,
 * or restrict banking to steps whose entire result is the verdict. Neither is
 * implemented, and the honest alternative already exists in the tree —
 * tooling/lib/release-cache.mjs and tooling/lib/gate-receipts.mjs reuse by
 * content hash and are wired into the pipeline that ships.
 *
 * tests/features/release-step-resume.test.mjs holds the acknowledgement and the
 * path this file shares with tooling/release-step-resume.mjs.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { releaseStepBankPath } from "./release-receipt.mjs";

export const STEP_BANK_ENV = "AI_SYSTEM6_STEP_BANK";
export const STEP_BANK_ACK_ENV = "AI_SYSTEM6_STEP_BANK_ACK_UNSOUND";

/**
 * Is the bank asked for, and has the caller acknowledged what it does?
 *
 * Throws rather than returning false when the bank is requested without the
 * acknowledgement: a silent "off" would look like a bank that simply had nothing
 * to reuse, which is the wrong thing to infer from a mechanism that cannot be
 * trusted to reuse safely yet.
 */
export function stepBankEnabled(env = process.env) {
  if (env[STEP_BANK_ENV] !== "1") return false;
  if (env[STEP_BANK_ACK_ENV] !== "1") {
    throw new Error(
      `${STEP_BANK_ENV}=1 is a known-unsound experiment: a reused step is never re-run, and its outputs live in trees each run recreates, `
      + `so the retry fails at the next copyInto with "Expected release artifact is missing". `
      + `Set ${STEP_BANK_ACK_ENV}=1 to run it anyway — see tooling/lib/step-bank.mjs.`,
    );
  }
  return true;
}

/** Read/modify the bank at the shared path for one repository. */
export function createStepBank(repositoryRoot) {
  const bankPath = releaseStepBankPath(repositoryRoot);
  const read = () => {
    if (!existsSync(bankPath)) return { schemaVersion: 1, steps: {} };
    try {
      const data = JSON.parse(readFileSync(bankPath, "utf8"));
      if (data.schemaVersion === 1 && data.steps) return data;
    } catch {}
    return { schemaVersion: 1, steps: {} };
  };
  return {
    path: bankPath,
    lookup(step) {
      const bank = read();
      const entry = bank.steps[step.name];
      return entry && entry.status === "ok" && entry.identity === step.identity ? entry : null;
    },
    saveOk(step, durationMs) {
      const bank = read();
      bank.steps[step.name] = { status: "ok", identity: step.identity, durationMs, at: new Date().toISOString() };
      try { writeFileSync(bankPath, JSON.stringify(bank, null, 2)); } catch {}
    },
    clearFailed(step) {
      const bank = read();
      if (bank.steps[step.name]) {
        delete bank.steps[step.name];
        try { writeFileSync(bankPath, JSON.stringify(bank, null, 2)); } catch {}
      }
    },
  };
}
