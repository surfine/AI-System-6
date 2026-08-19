# Bonsai City — Original City Simulator

Working name: **Bonsai City / 盆景城市** (final name not yet approved).

Bonsai City is an original, MIT-clean isometric city-building simulator inside
AI System 6. It shares the long-term shape of classic city-builder experiences
— layered tile grids, altitude, zoning, and RCI demand feedback — but it is
written from first principles. No code, art, sound, copy, data, or fixtures
come from SimCity 2000, Maxis, EA, OpenSC2K, Micropolis, or OpenTTD.

**Inspiration anchor:** the public design ideas of SimCity 2000 — layered tile
grids, altitude and isometric terrain, RCI demand feedback, power grids, and
growth milestones. Only public ideas are borrowed; nothing from Maxis or EA
enters the code, data, art, sound, or copy.

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
- The kernel now carries a versioned command layer (immediate and
  future-dated queued commands with monotonic sequences), a versioned event
  stream, and canonical checkpoint serialization; determinism is pinned by
  `tests/features/bonsai-kernel.test.mjs`.
- Phase 2 adds the portable save envelope (`encodeSave`/`decodeSave` with
  SHA-256 integrity over canonical JSON, pure migration chain) and an
  in-memory city repository (`createCityRepository`) with an injectable clock;
  both are pinned by `tests/features/bonsai-save.test.mjs`.
- Phase 3 wires the lazy System 6 shell: the `bonsaiCity` creative-lab window
  opens from Applications, runs the core at a 20 Hz pacing loop with
  pause/slow/medium/fast, turns pointer input into commands on a flat
  top-down preview canvas, and persists cities to the dedicated
  `bonsaiCities` IndexedDB store through the shared write-fence helper. Pinned
  by `tests/features/bonsai-shell.test.mjs`.
- Phase 4 replaces the preview with the original isometric renderer: 2:1
  diamond projection, altitude lift, painter-order draw, and camera pan/zoom
  as pure view state. Pointer input maps through the inverse projection into
  commands only. Pinned by `tests/features/bonsai-renderer.test.mjs`.
- Phase 5 is the playable vertical slice: new city, build roads/zones/power,
  run at 20 Hz with speed control, query tiles, save/load through the
  integrity envelope, and an Open Cities list. Closing the window saves.
  Pinned by `tests/features/bonsai-slice.test.mjs`.
- Phase 6 lands the SimCity 2000-inspired systems: police/fire stations with
  funding-scaled coverage, traffic and congestion that stalls growth, land
  value, a deterministic economy cycle, and a city report with a mayor
  rating. Pinned by `tests/features/bonsai-systems.test.mjs`.
- Phase 7 replaces the flat diamond painter with a three.js isometric voxel
  scene: voxel terrain, water, roads/wires/parks, stage-scaled R/C/I
  buildings, trees, plants and services, a tick-driven day/night cycle, and
  decorative traffic derived from the congestion layer. The renderer consumes
  a pure `buildRenderSnapshot` and lazy-loads a bundled three.js vendor; the
  original 16x16 Minecraft-style atlas is MIT-clean with a provenance record.
  Pinned by `tests/features/bonsai-voxel.test.mjs` and
  `tests/features/bonsai-atlas.test.mjs`.
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
