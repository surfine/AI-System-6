# Bonsai City — SimCity 2000 Save Compatibility

Status: **bidirectional — import (M2) and export (M7) shipped**; the final
certification step is the owner's manual run below. Authorized by the
phase 9 contract; licensing rules in
[LEGAL-AND-PROVENANCE.md](LEGAL-AND-PROVENANCE.md).

**Export**: every saved city offers "Export .sc2" beside the JSON export.
A native city synthesizes every segment (64/96 maps embed centered in a
128-square salt-water apron); an imported city re-emits its preserved
sidecar bytes for everything the model does not own (labels, signs,
moving things, unmodeled MISC fields) and overwrites only modeled fields.
The RLE encoder is canonical, so our own output is byte-stable across
round trips — proven by the property suite.

## What works today

Open Cities → Import accepts `.sc2` city files beside the native
`.bonsai-city.json` format. The file is detected by its `FORM` container
magic, parsed entirely in the browser (worker-first, bounded main-thread
fallback), and saved as a new native city record. Nothing is uploaded, and
the source file is never modified.

The importer maps, per tile: altitude and water level (ALTM), water class
incl. waterfalls, streams, and bays (XTER), salinity and footprint rotation
(XBIT), zones incl. military/airport/seaport (XZON), roads, rails, power
lines, trees, and parks (XBLD ranges), pipes, subways, and crossovers
(XUND), and grown R/C/I buildings with size-class stages and
construction/abandoned states. City scalars arrive from MISC: funds,
founding year, city age (as ticks), the residential tax rate, and the five
service funding levels. Power plants and services with native equivalents
become working facilities (plants map by output class).

Every decompressed segment is preserved verbatim in the save's
`sc2Sidecar`, so nothing an import does not yet simulate is lost; re-export
(M7) starts from those bytes.

## Known M2 approximations

- SC2K power plants are 4×4. A native coal plant now takes the full 4×4 pad
  (save rule 3.1); the importer still opens the other plant kinds and any
  imported coal plant on the smaller anchor footprint, and such a record
  keeps that size on the map (the query panel names it "older 2×2 plant").
  Mapping the importer's coal footprint to the full pad is codec work.
  `catalogId` keeps the real building id on every tile.
- Highways and onramps are working layers (M3b-2b): imported highway ids
  (including crossovers and reinforced bridges) land on the `highway`
  layer, crossovers also keep the road/rail/power line they cross, and
  onramp ids land on `onramp`. Native export writes the two straights,
  the four corners, and the four-way; tee junctions land on the four-way,
  and the unrotated onramp family is canonical. An imported onramp tile
  does not also count as road. Road tunnels stay road tiles.
- Rail stations are not yet mapped to working stations (M3).
- Labels and signs ride the sidecar until their milestone. Moving things
  (M6-3): the civil XTHG kinds — airplane, helicopter, ship, sailboat —
  import as live things and export for native cities; an imported city's
  XTHG re-emits verbatim from the sidecar, so deploys, monsters, and the
  header record are never lost, at the cost that simulated movement does
  not reach an imported city's re-export.
- The 64×64/32×32 derived grids are recomputed by our simulation:
  `sc2DerivedGrids(state)` is a pure read that downsamples traffic to 64×64
  and pollution, land value, crime, police strength, and fire strength to
  32×32 by cell mean, whatever the map size. Export writes XTRF/XPLT/XVAL/
  XCRM (quarter grids) and XPLC/XFIR/XPOP (sixteenth grids) plus XROG/XGRP
  from the live model; import preserves the original grid segments verbatim
  in the sidecar and the display reads the simulation's recomputed grids, so
  an imported city's overlays always match its running state rather than a
  stale snapshot.

## Owner manual check (with a legally-owned copy of SC2K)

No EA-origin city file may ever be committed, bundled, or uploaded. The
following runs entirely on the owner's machine:

1. Save a city in your own copy of SimCity 2000.
2. Bonsai City → Open Cities → Import → pick the `.sc2` file.
3. Compare against the original game's windows: map layout and coastline,
   funds, date (year), tax rate, funding levels, zones and building
   density, road/rail/power/pipe/subway networks.
4. Run the city for a game year at normal speed; note anything that decays
   which should not (file an issue note per system).
5. After M7: export back to `.sc2`, reload it in SimCity 2000, and confirm
   the game accepts it and the city plays on.

Record findings in the implementation-status file; divergences feed the
parity tuning milestones.

### Certification run sheet

One row per system, filled on the owner's machine; the sample city is the
synthetic one `tests/features/bonsai-sc2.test.mjs` builds ("the native
town"), exported through the File menu, never an EA file.

| System | Original window | Bonsai surface | Match (yes / no / note) |
| --- | --- | --- | --- |
| Map, coastline, altitude | map view | 2D and 3D views | |
| Funds, date, tax rates | budget window | gauge bar, budget pane | |
| Eleven funding lines | budget window | budget pane | |
| Zones and density | zone view | 分区 display toggle | |
| Roads, rail, power, pipes, subway | network views | 基础设施 / 地下 toggles | |
| Plants and their outputs | query dialog | query balloon (footprint row) | |
| Traffic 64×64, pollution / land value / crime / police / fire 32×32 | data views | Data Views submenu | |
| Ordinances | ordinance window | budget pane checklist | |
| Rewards offered | reward dialogs | rewards rail group | |
| Newspaper | newspaper | Newspaper menu | |
| Re-export plays on in SC2K | game accepts the file | File → Export .sc2 | |

## Fixture policy

Codec tests build every `.sc2` fixture synthetically at run time
(`tests/features/bonsai-sc2.test.mjs`). Hand-authored byte arrays cover RLE
edge cases. No city file binary exists in the repository.
