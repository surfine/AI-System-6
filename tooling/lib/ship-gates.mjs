// The gates a release must pass, declared once.
//
// Three, all deterministic, all unattended, together about five minutes:
//
//   static-smoke           one real Chromium boot of the desk
//   cascade-ledger-desktop the winning CSS rule of every cell, desktop viewport
//   cascade-ledger-phone   the same, phone viewport
//
// They compare declared rules and computed values, never pixels, so a machine's
// fonts, compositor and load cannot change a verdict. The pixel appearance
// nets, the Theme Lab regression, the device matrix, the eight-stop walk and
// the Bonsai runs are audits a person runs on demand (`npm run audit:*`);
// internal/operations/RELEASE.md says what each one checked and why it left
// the gate.
//
// tooling/verify-ship.mjs runs this list. The build happens once before it
// (verify:release in a release, `npm run build:app` by hand), so every gate
// here passes --no-build or boots the already-built desk.

export const SHIP_REQUIRED_CHECKS = Object.freeze([
  "static-smoke",
  "cascade-ledger-desktop",
  "cascade-ledger-phone",
]);

export const SHIP_GATES = Object.freeze([
  {
    // One engine on purpose. By itself the smoke also boots WebKit, whose
    // local-model probe of 127.0.0.1:1234 fails its CORS check whenever LM
    // Studio is running on the machine (seen 2026-10-15): a verdict about the
    // machine, not the desk. `npm run test:static-smoke` still runs both.
    name: "static-smoke",
    args: ["tests/e2e/static-only-smoke.mjs"],
    env: { AISYSTEM6_STATIC_ENGINE: "chromium" },
  },
  {
    name: "cascade-ledger-desktop",
    args: ["tooling/cascade-ledger.mjs", "--verify", "--no-build"],
  },
  {
    name: "cascade-ledger-phone",
    args: ["tooling/cascade-ledger.mjs", "--verify", "--viewport", "390x844", "--no-build"],
  },
]);

export function shipGate(name) {
  return SHIP_GATES.find((gate) => gate.name === name) || null;
}

/** The gate's entry script: the first argument of its command. */
export function shipGateEntry(gate) {
  return gate.args[0];
}
