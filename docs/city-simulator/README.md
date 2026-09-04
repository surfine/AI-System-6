# Bonsai City — Original City Simulator

Official product name: **Bonsai City / 盆景城市**.

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
  `apps/desktop/app/features/bonsai-city-sim.js` (64/96/128 tile grids, seeded
  terrain presets, independent networks and zoning, construction, utilities,
  services, population/demand/finance, integer ticks, and v3
  `serialize`/`deserialize`). It is wired through the lazy Applications →
  Games window and ships in the curated 1.0.50 public beta snapshot.
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
  pause/slow/normal/fast, turns pointer input into previews and commands, and
  persists cities to the dedicated
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
- Phase 8 replaces the rejected voxel showcase with the single production
  Canvas 2D renderer: 48x24 isometric tiles, four quarter-turn views, six
  composited layers, visible-diagonal culling, 16x16 static chunk caches, and
  deterministic original sprite atlases. The renderer consumes a pure
  `buildRenderSnapshot`; pointer, keyboard, and touch input still emit commands
  only. Pinned by `tests/features/bonsai-renderer.test.mjs`,
  `tests/features/bonsai-atlas.test.mjs`, and the real-browser
  `verify:bonsai-acceptance` gate.
- The atlas family grows a night variant set (M5-2c): every growable
  building, facility, and catalog special gains a dimmed lit-window frame,
  and the Canvas renderer's time-of-day gate swaps to those frames at dusk,
  with the recorded window rects drawn bright on the lighting layer — the
  SimCity 2000 night signature, generated entirely from the original
  project recipes.
- The voxel backend gains an original micro-voxel texture atlas (M5-2d):
  a power-of-two 512px sheet of 40 procedural 64px tiles, loaded lazily
  with nearest magnification and mipmaps for Retina and mobile. Paths
  (road, rail, pipe, wire, highway, bridge, tunnel) draw direction-aware
  continuous strips, and buildings get per-zone walls, per-variant roof
  details, and per-facility surfaces.
- The voxel world extrapolates the SimCity 2000 benchmark (M5-2e): three
  tree shapes (broadleaf, conifer, sapling), gabled houses and setback
  high-rises, bespoke landmark silhouettes (domes, civic towers, stadium
  tiers, cranes, piers), beach-lined coasts, shimmering animated water,
  continuous road curbs, and two-tone cars.
- Water and disaster signatures (M5-2f): waterfalls render where water
  meets high land, animated on both backends from the snapshot clock, and
  active tornado and monster disasters get visible funnels and monsters.
- Special-zone ground visuals (M5-2g): military, airport, and seaport zones
  render as installation, runway, and dock ground — with continuous runway
  markings on the Canvas pad — instead of invisible grass.

### Tile scale

Both backends share one 48-pixel isometric tile and one default zoom (0.82),
so the tile-scale review has a single fact to argue from. At default zoom a
1024×640 viewport shows about 26.0 tile diamonds across and 32.5 diamond rows
down — measured by `measureFrame` in `app/features/bonsai-renderer.js` and in
the voxel backend's pure toolkit, which report the same numbers. A SimCity
2000 proportion retune remains an owner proposal pending reference captures,
never a silent change.

Reference constants for that proposal (verified 2026-09-04 against the
disc copy and the SC2k-docs / sc2k-city-viewer renderer notes): SimCity 2000
draws 64-pixel-wide, 32-pixel-high diamond tiles with a 24-pixel layer
offset (2:1 ratio, the same 30-degree elevation). At the same 1024×640
viewport and the same on-screen diamond pitch as our default zoom, a 64px
tile shows about 19.5 diamonds across and 24.4 rows down — roughly 25%
closer framing with the same tile-edge pixel length as our canvas at zoom
1.05. The retune (48 → 64 px with a matching zoom retarget) touches the
atlas, voxel wall tiling, pointer math, and acceptance pins together, which
is why it stays an owner call, not a silent change.
- The Canvas 2D view gains SC2000-style 2.5D depth (M5-2h): lit roof
  parapets, facade floor lines, front doors, two-tone trees with shadows,
  richer terrain (speckle, blades, water sheen, coast foam), and soft
  ground shadows under every building and landmark.
- Terrain depth, water life, and zone claim (M5-2i): cliff shadow bands
  where ground steps down (both backends), shimmering animated water on the
  Canvas lighting layer, and a subtle hatch on R/C/I zones.
- A zen-clean Japanese-Minecraft atmosphere (M5-2j): muted moss/ink/paper
  palette, calmed terrain and water detail, one pale moon with sparse paper
  lanterns at night, a tiered pagoda temple landmark, an elevation-tinted
  SC2000 minimap, and tick-swinging construction cranes.
- Water-edge torii on piers and marinas, a zen-garden corner in park
  textures, and snow-capped peaks above the snow line (M5-2k) — the
  OpenTTD benchmark is met on principles (clean terrain, one quiet detail
  per surface), never by copying its GPL assets.
- 2D path continuity reaches 3D parity (M5-2l): highways, onramps, and
  bridges over water draw direction-aware mask frames that turn corners and
  continue across tile edges, and road bores get dark tunnel overlays with
  portal frames — the OpenTTD approach on our own original recipes.
- Maple accents and 2D power poles (M5-2m): roughly one in five trees is a
  red maple in both backends, and wire frames carry poles with crossarms.
- Port signatures and moon water (M5-2n): sparse control towers on airport
  pads, dock cranes on seaport pads, and a faint moon reflection on water
  at night.
- Road curbs in 2D and seasonal maples (M5-2o): streets gain quiet curb
  edges in the atlas, and in autumn the maple share rises to about half the
  canopy in both backends.
- The four seasons (M5-2p): sakura blossom crowns in spring, deep greens in
  summer, the maple forest in autumn, and snow-dusted crowns in winter —
  cycling purely from the snapshot calendar in both backends.
- Winter ground snow (M5-2q): in the fourth season the whole lowland snows
  over in both backends, melting back to moss in spring.
- Seasonal water (M5-2r): lakes freeze to pale ice in winter and brighten
  in spring, across both backends and the minimap.
- A warm UX pass (M5-2u): guiding bilingual copy, a gentle first-run hint
  that fades after the player's first move, and scoped theme-token CSS.
- Sakura petals drift in spring (M5-2s), and highways and onramps are now
  real: divided carriageways and wide-to-narrow ramps in both backends
  (M5-2t).
- The simulation/save contract advances to v2: 64/96 maps, independent
  terrain/transport/power/water/zone/building layers, atomic path and area
  commands with pure previews, five ticks per game day, density and
  construction states, water and service systems, policy/history/loan state,
  and a pure v1-to-v2 migration. Existing `bonsaiCities` records remain in the
  dedicated store; the IndexedDB schema does not change.
- Two fixed recipes (`starter-town` and `troubled-mid-size`) replay original
  v2 command logs through the real simulation and save codec. Their final
  checkpoints are pinned so examples cannot drift into static scenery.
- The GPL games (Micropolis, OpenTTD, DOOM) are separate shipped products and
  share no code with the Bonsai path.
- Phase 9 opens the **SC2000 parity program** (owner directive, 2026-08-23):
  Bonsai City grows into full SimCity 2000 gameplay parity with bidirectional
  `.sc2` save compatibility (clean-room codec from attributed public format
  facts; synthetic fixtures only), a lazy three.js voxel renderer backend
  (Canvas 2D retained as the WebGL-unavailable fallback; both read the same
  render snapshot), original Minecraft-style micro-voxel art generated from
  project recipes, and original synthesized music and sound. EA expression
  (code, art, sound, text, city files) stays fully prohibited; see
  [LEGAL-AND-PROVENANCE.md](LEGAL-AND-PROVENANCE.md).
- Completion program, lane B (2026-09-03/04), toward the owner's
  OpenTTD-level acceptance:
  - No dead ends: `tests/features/bonsai-no-dead-ends.test.mjs` boots the
    shell in the app harness, founds a city through the real setup form,
    and runs every menu command (each must change the DOM, the shell state,
    or the city checkpoint), arms every rail tool through the rail click
    path, checks the core understands every tool command, and requires every
    reachable `bonsai_*` key in both languages. 自动预算 (auto-budget) ships:
    off by default, January holds the clock with the budget pane open; on,
    the previous budget lines roll on. A disaster chosen from the menu now
    reports in the status line.
  - Two hours without a stall: `npm run verify:bonsai-playthrough` runs a
    deterministic scripted mayor on the headless core (lattice, zoning by
    demand, plants and waterworks, services and transit, bonds, ordinances,
    one disaster per decade, rewards) and refuses on a stall, a reward left
    unplaced, a missing story key, or twelve months in the red. Its first
    run found the core oscillating (a serviced 6 000-resident city fell to
    16 in two months); oversupply now has to hold for three settled months
    before a working building declines. The mayor reaches 50 000 residents
    in game year 1909 and plateaus near 68 000 on a 128-square map. It is a
    quiet ship gate.
  - SC2K parity: a coal plant takes the 4×4 pad (save rule 3.1, older
    plants keep 2×2 and the query balloon says so), `sc2DerivedGrids` reads
    the 64×64 / 32×32 grids, the EQ/LE ordinance hooks are confirmed live,
    and [SC2-COMPAT.md](SC2-COMPAT.md) carries the owner's certification
    run sheet.
  - Integration at OpenTTD's level: a saved-N-s-ago line in the gauge bar,
    the pagehide flush confirmed through the application registry, the
    window already in the mobile full-screen and immersive sets, and one
    synthesized sound per simulation event.

## Document map

- [ARCHITECTURE.md](ARCHITECTURE.md) — layers, determinism, command/event
  interfaces, shell and lifecycle contracts.
- [SAVE-FORMAT.md](SAVE-FORMAT.md) — the versioned save format and the future
  integrity/migration chain.
- [LEGAL-AND-PROVENANCE.md](LEGAL-AND-PROVENANCE.md) — MIT boundary, GPL
  separation, and asset provenance rules.
- [OPENSC2K-RESEARCH.md](OPENSC2K-RESEARCH.md) — pinned research notes and
  what may and may not be adopted.
- [SC2-COMPAT.md](SC2-COMPAT.md) — the `.sc2` import/export status, known
  approximations, fixture policy, and the owner's manual check protocol.
- [SC2K-SYSTEMS-STUDY.md](SC2K-SYSTEMS-STUDY.md) — clean-room system study
  from the published save spec: what SC2K does as systems, what Bonsai has,
  and the gaps (weather, underground crossovers, military base, arco family).
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
npm run verify:bonsai-playthrough   # the scripted two-hour mayor (quiet ship gate)
```

Repo-wide release gates are documented in [DEVELOPMENT.md](../DEVELOPMENT.md).
