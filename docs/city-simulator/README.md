# Bonsai City — Original City Simulator

Working name: **Bonsai City / 盆景城市** (final name not yet approved).

Bonsai City is an original, MIT-clean isometric city-building simulator inside
AI System 6. It shares the long-term shape of classic city-builder experiences
— layered tile grids, altitude, zoning, and RCI demand feedback — but it is
written from first principles. No code, art, sound, copy, data, or fixtures
come from SimCity 2000, Maxis, EA, OpenSC2K, Micropolis, or OpenTTD.

## Phase 0 scope

Phase 0 establishes the foundation and construction rules only:

- three-layer architecture boundary;
- determinism, tick, seed, command, and event contracts;
- versioned save-format contract and migration policy;
- AI System 6 shell decisions (window role, status, responsive, lazy load,
  lifecycle);
- license and provenance rules;
- a machine-readable foundation contract, a scoped AGENTS file, this
  documentation set, an implementation-status file, and an executable
  foundation test.

Phase 0 does **not** implement gameplay, map rendering, a window, a
persistence store, or dependencies.

## Current state

- A headless simulation core exists at
  `apps/desktop/app/features/bonsai-city-sim.js` (64×64 tile grid, seeded
  terrain, zones, roads/wires/parks, power plants, population and demand,
  funds, integer ticks, `serialize`/`deserialize`).
- The core is committed but deferred from the public snapshot and is not
  wired into any window or menu.
- The core's seed policy is now contract-enforced: the shell must provide an
  integer seed; the core never falls back to `Math.random()`.
- The GPL games (Micropolis, OpenTTD, DOOM) are separate shipped products and
  share no code with the Bonsai path.

## Document map

- [ARCHITECTURE.md](ARCHITECTURE.md) — layers, determinism, command/event
  interfaces, shell and lifecycle contracts.
- [SAVE-FORMAT.md](SAVE-FORMAT.md) — the versioned save format and the future
  integrity/migration chain.
- [LEGAL-AND-PROVENANCE.md](LEGAL-AND-PROVENANCE.md) — MIT boundary, GPL
  separation, and asset provenance rules.
- [OPENSC2K-RESEARCH.md](OPENSC2K-RESEARCH.md) — pinned research notes and
  what may and may not be adopted.
- [AGENTS.md](AGENTS.md) — scoped working rules for agents.
- `foundation-contract.json` — the machine-readable Phase 0 contract enforced
  by `tests/features/city-simulator-foundation.test.mjs`.
- CITY-SIMULATOR-IMPLEMENTATION-STATUS.md
  — implementation status and open decisions.

## Verification

```sh
npm run verify:quick -- --feature city-simulator-foundation --docs --no-build
npm run verify:feature -- city-simulator-foundation
npm run verify:docs
```

Repo-wide release gates are documented in [DEVELOPMENT.md](../DEVELOPMENT.md).
