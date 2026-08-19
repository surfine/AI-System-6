# Bonsai City Architecture

## Three layers

```text
AI System 6 shell  ── lifecycle, window, status, i18n, persistence adapter
        │  owns pacing and seed generation
        ▼
renderer + input  ── consumes snapshots/events; emits commands only
        │  no simulation state
        ▼
simulation core  ── rules, ticks, PRNG, commands, events, save codec
```

### Simulation core

The core owns the only authoritative city state. It is headless: no DOM,
canvas, `window`, IndexedDB, translation table, wall clock, timers, or
`Math.random()`. It is a classic script installing `window.AISystem6BonsaiSim`
with `createCity`, `advanceTicks`, `applyTool`, `tileInfo`, `ensureDerived`,
`dateOf`, `drainNotices`, `serialize`, and `deserialize`.

### Renderer and input

Implemented in Phase 4 as the pure projection module `bonsai-renderer.js` and
replaced visually in Phase 7 by `bonsai-renderer-voxel.js`. The pure module
keeps the 2:1 isometric projection, its inverse, and deterministic painter
order as VM-testable view math. The voxel renderer consumes the pure
`buildRenderSnapshot` and draws an orthographic isometric three.js scene
(voxel terrain, water, roads/wires/parks, stage-scaled buildings, trees,
plants, services, day/night, decorative traffic) while lazy-loading a bundled
three.js vendor. The renderer reads snapshots only — pointer, keyboard, and
touch produce commands through `submitCommand`, never direct mutation. Camera
and lighting are view state and never enter the save; the pacing loop draws
and never advances rules.

### AI System 6 shell

The shell owns the window, MultiFinder identity, menus, status bar, i18n,
lazy loading, lifecycle, Working Session, and the persistence adapter. It
generates seeds via `crypto.getRandomValues` and paces ticks.

## Determinism contract

- **Tick model.** The core advances whole integer ticks (`advanceTicks(state,
  count)`); the shell paces a logical 20 Hz tick rate. Speed settings scale
  ticks per shell frame, never wall-clock catch-up.
- **Seed.** The shell provides an integer seed at `createCity`. A missing or
  non-integer seed throws `bonsai-required-seed`; the core never invents
  randomness.
- **PRNG.** `mulberry32-v1`, 32-bit state, serialized with the save.
  Deterministic across Node and browsers because it uses only integer
  arithmetic (`Math.imul`, bitwise ops) and well-defined IEEE-754 math.
- **Stable iteration.** Every rule pass iterates arrays in fixed order; no
  object-key iteration affects a result.
- **Checkpoints.** Phase 1 provides canonical serialization
  (`canonicalStringify`) and kernel-level checkpoints: SHA-256 over canonical
  sorted JSON. Same seed + ruleset version + command sequence must produce the
  same hash in Node and the browser. Phase 2 wraps this digest into the save
  envelope's integrity record.

## Commands

```json
{ "schemaVersion": 1, "type": "road", "payload": { "x": 5, "y": 8 }, "targetTick": 120, "clientCommandId": "c-1" }
```

Implemented in Phase 1. The core assigns a monotonically increasing `sequence`
to every accepted command (immediate or queued); rejected commands consume no
sequence and never mutate state. Future-dated commands wait in a
`(targetTick, sequence)` ordered queue and apply exactly at their target tick.
The shell never mutates state directly — it always submits commands.

## Events

```json
{ "schemaVersion": 1, "tick": 120, "sequence": 41, "type": "milestone", "payload": { "threshold": 250 } }
```

Implemented in Phase 1. Events are committed domain facts: no DOM references,
no translated strings, no wall-clock timestamps. The shell drains them with
`drainEvents`; they are derived from the simulation and never persisted. UI
localizes at render time.

## Save format

See [SAVE-FORMAT.md](SAVE-FORMAT.md). Durable layers are saved; derived
layers (`powered`, `roadOk`, `plantAt`, counts) are rebuilt on load.

## Shell contract

The future window contract (not yet registered):

| Decision | Value |
| --- | --- |
| Object role | `creative-lab` |
| Route | summoned |
| Document model | SDI |
| Status model | `specialized` |
| Status layout | `task-specific` |
| Responsive model | `immersive` |
| Workspace | shared (not Writing Studio) |
| Launch | Applications → Games only |

Status priority: (1) confirmed receipts for save/load/migrate/fail; (2) city
identity and dirty state; (3) simulation time, speed, secondary metrics.
Narrow layouts fold secondary commands into `Commands…`; a live receipt never
disappears.

### Lifecycle

```text
load → attach (idempotent) → activate/resume
     → suspend(reason) → beforeClose → close/quit
```

- Ticks run only while the window is visible, not app-hidden, not collapsed,
  and the document is visible, and the user pressed Play.
- Suspension never wall-clock-catches-up missed ticks.
- `close/quit` stops timers/RAF, releases input capture, and on dirty state
  runs Save / Discard / Cancel. `Saved` renders only after the IndexedDB
  transaction confirms.
- Working Session stores window frame, camera, selection, panel state, and
  the most recent city id — never the city body. Restore validates/migrates
  the save and stays paused.

### i18n

Dynamic UI stores semantic keys, not translated strings. English and Chinese
keys land in the same change; a language switch calls the loaded module's
idempotent render. High-frequency simulation metrics never trigger repeated
`aria-live` announcements.

## What Phase 0 does not include

No window registration, runtime/style manifest entries, IndexedDB schema
change, npm dependency, runtime asset, `.SC2` fixture, or game code in the
original path. The foundation test enforces this.
