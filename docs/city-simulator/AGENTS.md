# AGENTS.md — Bonsai City (original city simulator)

Scope: the original, MIT-clean city-building simulator inside AI System 6
(working name **Bonsai City / 盆景城市**). This file is the scoped rule set for
any agent touching that path. The GPL game engines (Micropolis, OpenTTD,
DOOM) are separate products; rules here do not govern their vendor code.

## Always read first

- CLAUDE.md — repo-wide authority.
- [README.md](README.md) — what this project is and its current phase.
- [ARCHITECTURE.md](ARCHITECTURE.md) — three-layer boundary and determinism
  contract.
- [LEGAL-AND-PROVENANCE.md](LEGAL-AND-PROVENANCE.md) — what may enter the
  original path, and what never may.
- `docs/city-simulator/foundation-contract.json` — the machine-readable Phase 0
  contract; the foundation feature test enforces it.

## Hard rules

1. **No GPL or original-game code in the Bonsai path.** Never copy, port, or
   approximate OpenSC2K (GPL), micropolisJS (GPL), OpenTTD (GPL), or any
   Maxis/EA/SimCity 2000 code, art, sound, copy, data, or fixtures. A
   requirement that sounds like it needs one of those is a design signal:
   stop and re-derive the need from first principles.
2. **The simulation core stays headless.** No DOM, canvas, window, IndexedDB,
   wall clock, timers, or `Math.random()`. The shell owns seed generation and
   pacing; the core owns rules, ticks, and deterministic state.
3. **No `.SC2` files, no original resources.** Public format notes (SC2k-docs)
   may be cited with attribution; verbatim text and extracted assets may not.
4. **Phase 0 boundary holds.** Do not register a window, edit runtime or style
   manifests, bump `indexedDbVersion`, add an npm dependency, or add runtime
   assets until a later phase explicitly removes that invariant.
5. **Every durable decision lands in the hub.** Update
   `foundation-contract.json` and the docs in the same change that changes the
   decision; `tests/features/city-simulator-foundation.test.mjs` must stay
   green. Do not keep private copies of names, versions, or rules in one file.

## Verification

```sh
npm run verify:quick -- --feature city-simulator-foundation --docs --no-build
npm run verify:feature -- city-simulator-foundation
npm run verify:docs
```

Merge/closeout still requires the repo-wide gates (`verify:release`,
`verify:ship`) in an environment with the canonical fidelity cache.

## Status

Current status lives in
CITY-SIMULATOR-IMPLEMENTATION-STATUS.md.
Open decisions (final product name, save persistence boundary) are recorded
there; do not resolve them silently.
