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
| `facilities` | power, water, transport, and public-service facilities; a record may carry its own `w`/`h` (save rule 3.1: a coal plant records the SC2K 4×4 pad, a record without one is an older 2×2 plant and keeps that size) |
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
- Save rule 3.1 (facility footprints) is additive inside v3: `deserialize`
  keeps a record's `w`/`h` when present and `footprintOf` answers the
  legacy size for a record without one, so no envelope version moves and an
  old city loads byte-for-byte. The troubled example checkpoint was re-pinned
  because its recipe now builds the 4×4 pad.

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
Micropolis `cities` store for Bonsai state. Import validates format, version,
structure, and integrity before assigning a new city id; it never overwrites
an existing record. The v3 record envelope does not require an IndexedDB
schema bump.

The one crossing of that boundary is deliberate and one module wide: Bonsai
summons Micropolis cities and can send a city back; both directions are lossy
and report the loss. The outbound half, `bonsai-micropolis-export.js` (MIT),
writes a record into the `cities` store as plain JSON numbers — a data format,
not code — stamped `provenance: { from: "bonsai-city", cityId, exportedAt }`,
and never writes a Bonsai envelope there. See "Interop with Micropolis" below.

## Interop with Micropolis

Both directions are conversions between two formats that model different
things; neither is a container for the other. Every conversion returns a
`warnings` list of codes (`code` or `code:count`), and the shell shows all of
them before the player continues. The contracts are
`tests/features/city-save-import.test.mjs` (inbound) and
`tests/features/bonsai-micropolis-roundtrip.test.mjs` (outbound and round
trip); both build their fixtures by running the vendored engine at test time.

### Inbound — `bonsai-micropolis-codec.js`

A Micropolis `cities` record (or its bare `saveData`) becomes a v3 payload.
The classic 120×100 map embeds centred in the 128-square; the apron is salt
water. Roads, rails, and power lines carry by tile family, including the
crossings; a bridge lands as water with the network on top. Nine-tile zone
blocks land as per-tile zones with a stage and a density read from the
family, and the exact classic family (or house) rides the `variant` layer as
`1 + level` so the block goes back unchanged. Working plants and services
become live facilities at the classic top-left; stadiums, churches and
radioactive ground land as catalog tiles. Codes: `ruins-cleared:N`,
`tiles-without-equivalent:N`, `terrain-flat`, `population-recomputed`,
`ratings-not-carried`, `demand-reset`, `sc2k-only-systems-absent`.

### Outbound — `bonsai-micropolis-export.js`

`exportMicropolis(payload, options)` returns `{ saveData, name, warnings,
population, details }`. Options: `name`, `cityId`, `exportedAt` (the caller's
clock — the module never reads one), `powered` (the live power layer, used
only as a POWERBIT hint), `population`, and `window: { x, y }` to move the
crop.

- **Crop.** A 128-square map is cropped to a 120×100 window centred on
  `spawnCenter` (`cropWindowFor` returns the rectangle for a preview); 64-
  and 96-square maps embed centred, and the apron is open water. Content
  outside the window is counted in `map-cropped:N`.
- **Tiles.** Water and woods take the classic edge shape by neighbour mask;
  roads, rails and power lines take their shape by connectivity, the
  crossings by which network runs which way, and a network over water
  becomes a bridge. Zones are re-blocked into 3×3 families from the top-left
  in row order (ports 4×4, airports 6×6); a zone tile that fits no block is
  counted in `zone-tiles-unblocked:N`. Coal, nuclear, fire, police and
  clinic become their classic families at the same top-left; every other
  facility kind is counted in `facilities-without-equivalent:N` with the
  kinds in `details.facilityKinds`.
- **Flags.** ZONEBIT on block centres; BULLBIT, BURNBIT and CONDBIT as the
  classic scan leaves them; POWERBIT from the hint; ANIMBIT only on the
  fountain (the engine re-animates plants on its first scan).
- **Scalars.** `_cityTime = round(tick × 4 / 125)`, `totalFunds`, `cityTax`,
  the three funding dials; census, evaluation and demand valves start at the
  engine's fresh-city values; `_gameLevel` 0, `_speed` 1, `autoBudget` off.
- **Other codes.** `altitude-flattened`, `wires-dropped-at-crossings:N`,
  `layer-dropped-{pipe,subway,highway,onramp,tunnel,water-level}:N`,
  `records-dropped-{bonds,ordinances,microsims,things}:N`,
  `history-dropped`, `progress-not-carried`, `population-recomputed`. The
  full list is `WARNING_CODES`; the contracts hold every emitted code
  inside it.

### Round-trip facts (played engine city, 8000 ticks, measured by the contract)

Preserved on Micropolis → Bonsai → Micropolis: every tile family; every tile
id for roads (shape; traffic frames strip), rails, power lines, residential,
commercial, industrial, coal and police; ZONEBIT/CONDBIT/BURNBIT on every
tile; funds, tax, clock and funding dials. Preserved by family only: water
(edge frame differs on a share of shore tiles), woods (edge frame), dirt
(bulldoze bit on bare lots). Recomputed by the engine: POWERBIT, ANIMBIT,
traffic, BULLBIT on zone tiles the scan had not yet touched, the census,
score, valves and histories. On Bonsai → Micropolis → Bonsai the road, rail,
wire, water and tree layers are equal inside the crop window and zones are
equal per tile wherever they fit a classic block.

### The classic city file — `micropolis-cty-codec.js`

`encodeCty(saveData)` / `decodeCty(bytes)` move between the Micropolis JSON
save and the 27,120-byte classic file (six 240-value history tables, a
120-value misc table, then 120 columns of 100 big-endian tile values). The
JSON fields the file cannot hold (budget effects, last spend, the city
centre) come back as engine defaults and are named in the decode warnings.
Interop with files written by other programs is unverified by design: no
city file of any origin is committed, and the contract's fixtures are
engine-built.
