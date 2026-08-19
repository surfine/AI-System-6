# Bonsai City Save Format

## Identity

- **Save format:** `bonsai-city`
- **Current format version:** 1
- **Current engine save version:** 1
- **Engine map size:** 64×64 (fixed in v1)

The format name and version are pinned by the simulation core
(`FORMAT` / `SAVE_VERSION` in `apps/desktop/app/features/bonsai-city-sim.js`)
and by `foundation-contract.json`. Change one only with the other, in the same
commit.

## Version separation

Three numbers mean three different things and must never be conflated:

| Number | Means | Owner |
| --- | --- | --- |
| `formatVersion` | portable save structure | save codec |
| `rulesetVersion` (future) | simulation semantics | simulation core |
| `indexedDbVersion` | browser physical store layout | AI System 6 shell |

## v1 fields

`serialize()` emits plain JSON-compatible values:

| Field | Meaning |
| --- | --- |
| `format` / `version` | `bonsai-city` / 1 |
| `name` | city name (display only, no translation) |
| `seed` | initial integer seed |
| `rngState` | current 32-bit PRNG state |
| `tick` | integer tick count |
| `funds`, `taxRate`, `speed` | economy and pacing |
| `milestone`, `wasBroke`, `brownout` | status flags |
| `size` | 64 |
| `alt`, `water`, `tree`, `over`, `zone`, `stage`, `variant` | durable tile layers |
| `plants` | power plants `{ kind, x, y }` |

Derived layers (`powered`, `roadOk`, `plantAt`, population, jobs, demand,
capacity) are rebuilt on load and never saved.

## Migration policy

The future load path is a pure chain:

```text
parse → size/limit validation → (Phase 2: integrity verification) → clone
→ vN → vN+1 pure migration functions → current-version validation
→ rebuild derived layers
```

Rules:

- Migration never mutates the input; a rejected load keeps the original file
  exportable.
- A save newer than the running app is rejected explicitly (never partially
  migrated, never overwritten).
- `formatVersion`, `rulesetVersion`, and `indexedDbVersion` bumps are
  independent and each requires its own contract/test update.

## Future envelope (Phase 2)

Phase 2 wraps the v1 payload in an envelope that adds:

```json
{
  "format": "bonsai-city",
  "formatVersion": 1,
  "engine": { "rulesetVersion": 1, "fixedTickHz": 20 },
  "simulation": { "seed": "...", "rng": { "algorithm": "mulberry32-v1", "state": [0] } },
  "integrity": { "algorithm": "SHA-256", "canonicalization": "sorted-json-v1", "digest": "..." }
}
```

Canonicalization is sorted keys, arrays in order, no whitespace — stable across
Node and browsers so a checkpoint hash is portable.

## Persistence boundary (open)

Where city saves live in IndexedDB is an open decision. It must not silently
reuse the GPL Micropolis `cities` store, because that store belongs to a
different product line and the Bonsai path must stay provenance-clean. Options
are a dedicated store (an `ask first` boundary change) or project-scoped city
records; the decision belongs to a later phase.
