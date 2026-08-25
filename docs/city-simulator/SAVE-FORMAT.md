# Bonsai City Save Format

## Identity

- **Save format:** `bonsai-city`
- **Current format version:** 3
- **Current engine save version:** 3
- **Supported map sizes:** 64×64, 96×96, and 128×128 (the SC2K-native size)

The format name and version are pinned by the simulation core
(`FORMAT` / `SAVE_VERSION` in `apps/desktop/app/features/bonsai-city-sim.js`)
and by `foundation-contract.json`. Change one only with the other, in the same
commit.

## Version separation

Three numbers mean three different things and must never be conflated:

| Number | Means | Owner |
| --- | --- | --- |
| `formatVersion` | portable save structure | save codec |
| `rulesetVersion` | simulation semantics | simulation core |
| `indexedDbVersion` | browser physical store layout | AI System 6 shell |

## v3 fields

`serialize()` emits plain JSON-compatible values:

| Field | Meaning |
| --- | --- |
| `format` / `version` | `bonsai-city` / 3 |
| `name` | city name (display only, no translation) |
| `seed` | initial integer seed |
| `rngState` | current 32-bit PRNG state |
| `tick` | integer fixed-step count; five ticks equal one game day; a month is 25 days and a year 300 days (the SC2K calendar) |
| `yearFounded` | founding year, one of 1900 / 1950 / 2000 / 2050 |
| `funds`, `taxRate`, `funding`, `loan` | economy and policy state |
| `milestone`, `wasBroke`, `brownout` | status flags |
| `size`, `terrainPreset` | 64, 96, or 128 and the deterministic generator preset |
| `terrain`, `alt`, `water`, `shore`, `slope`, `tree` | durable terrain layers; altitude range is 0..31 |
| `road`, `rail`, `wire`, `pipe`, `zone`, `density` | independent network and zoning layers; zone values 4/5/6 are military/airport/seaport (model-level, commands arrive with the transport milestone) |
| `stage`, `buildingState`, `constructionTimer`, `variant` | durable development and construction layers |
| `catalogId` | explicit XBLD-aligned tile id; 0 means "derive from sim state" — the carrier that lets imported `.sc2` buildings survive until the sim takes ownership of the tile |
| `subway`, `waterLevel`, `salt`, `rotate`, `tunnel`, `waterKind` | v3 SC2K-model layers (underground, water table, salinity, footprint rotation, terrain tunnels, water classification) |
| `sc2Sidecar` | optional preservation side-table for an imported `.sc2` city (raw MISC bytes and unmodeled segments), or `null` |
| `facilities` | power, water, transport, and public-service facilities |
| `history` | bounded 120-month city history |
| `nextCommandSequence` / `pendingCommands` | deterministic command ordering |

Derived networks (`powered`, `watered`, road access, coverage, traffic),
multi-tile `buildingAt`/`buildings` anchors, problem flags, population, jobs,
demand, visual agents, and renderer caches are rebuilt on load and never saved.

View state (camera, active overlay, inspector, and day/night lighting) is
derived from `tick` or owned by the shell and is likewise never
serialized; a reloaded city replays the same simulation regardless of how it
was last viewed.

## Migration policy

The load path is a pure chain (implemented in Phase 2):

```text
parse → structural validation → integrity verification → clone
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

## Envelope

`encodeSave` wraps the v3 engine payload in an envelope:

```json
{
  "format": "bonsai-city",
  "formatVersion": 3,
  "metadata": { "cityId": "…", "name": "…", "createdAt": "…", "updatedAt": "…" },
  "engine": { "rulesetVersion": 3, "fixedTickHz": 20, "ticksPerDay": 5, "daysPerMonth": 25 },
  "simulation": { "seed": "...", "rng": { "algorithm": "mulberry32-v1", "state": [0] } },
  "payload": { "format": "bonsai-city", "version": 3, "…": "the v3 engine save" },
  "integrity": { "algorithm": "SHA-256", "canonicalization": "sorted-json-v1", "digest": "..." }
}
```

`decodeSave` validates the structure, recomputes the digest over the canonical
JSON of everything except `integrity`, and rejects tampered saves. `migrateSave`
is the pure chain; v1 maps its fixed 64×64 state into the independent v2
layers and converts `tick` to `tick * 5`; v2 gains the SC2K-model layers
zero-filled (with `waterKind` derived from `water`) and the default founding
year 1900. Newer versions are rejected explicitly.
Canonicalization is sorted keys, arrays in order, no whitespace — stable across
Node and browsers so a checkpoint hash is portable.

The in-memory `createCityRepository` (create/list/get/put/remove) remains the
test adapter. The shell persists v3 envelopes in the existing dedicated
`bonsaiCities` IndexedDB store through the shared write-fence helper.
Canonical serialization, integrity work, and large import parsing use the
dedicated save Worker when available. A bounded timeout/error path falls back
to the same direct codec; worker and fallback output are byte-identical.

## Persistence boundary

City saves live in the dedicated `bonsaiCities` store and never reuse the GPL
Micropolis `cities` store. Import validates format, version, structure, and
integrity before assigning a new city id; it never overwrites an existing
record. The v3 record envelope does not require an IndexedDB schema bump.
