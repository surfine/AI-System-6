# SC2K systems — clean-room study notes (learned, not copied)

Pinned learning record from the published SimCity 2000 Windows 95 save
specification (`OpenCity2k/SC2k-docs`, CC BY-SA 4.0) and the Moews file
format notes. This records what the original *does* as systems so Bonsai
can reimplement the behaviour clean-room; no Maxis/EA expression, code,
asset, or text is taken. Format facts are reported in our own words.

The `.sc2` container facts live in `SC2-COMPAT.md`; this file is the
**systems-level** mapping: what SC2K has, what Bonsai has, and what is a
genuine gap.

## MISC scalars SC2K stores that are systems, not display

These are city-authored state in the save, so a real port keeps them, and
each one maps to a Bonsai simulation system or a deliberate gap.

| Offset | SC2K system | Bonsai | Gap / action |
| --- | --- | --- | --- |
| 000C | City founding year | `yearFounded` | present |
| 0010 | City age in 300-day years | `tick` | present |
| 0014 | Money | `funds` | present |
| 0018 | Bond count | `bonds` | present |
| 001C | Game level (Map/Easy/Med/Hard) | city setup | present on New City |
| 0020 | Reward tier (Mayor..Arcos) | `rewardTier` | present |
| 0044/48/4C | Work force % / LE / EQ | workforce | present (EQ/LE hooks) |
| 0060–006C | Heat / Wind / Humidity / Weather | none | **gap: weather** |
| 0070 | Disaster type | per-disaster kind | partial (small set) |
| 007C–0168 | 3x20 population/health/education graphs | `graphs` (XGRP) | present |
| 016C–01EC | 3x33 industry graphs | `graphs` (industry) | partial |
| 06D8–0718 | 4 neighbours (pop/value/fame) | `neighbors` | present (limited) |
| 0718–0720 | RCI demand (–2000..+2000) | `demand` | present |
| 0738–0778 | Technology discovery years | `tech` on facilities | present |
| 077C–0854 | R/C/I tax rates 0–20 | `taxRates` | present |
| 0FA0 | 20 ordinance flags | `ordinances` | present |
| 0FE8 | Subway tile count | subway layer | present |
| 0FEC/0FF0/0FF4/0FF8/0FFC/1000/1004/1008 | speed, auto-budget, auto-goto, sound, music, no-disasters, paper delivery | speed, auto-budget | partial (music/no-disasters/paper) |
| 1014–101C | map view X/Y + zoom | not stored | **gap: view memory** |
| 1020/102C | Arco population / normal population | `arcoPopulation` | present |
| 0E40 | Water table level | `waterLevel` | present |
| 0E44/0E48 | coast / river generation flags | `terrainPreset` | partial |
| 0E4C | Military base state (offered/army/air/navy/missile) | military zone | **gap: military base system** |

## Weather (MISC 0060–006C)

SC2K models a current weather type plus heat, wind, and humidity; the
newspaper shows them. Twelve types:

`cold, clear, hot, foggy, chilly, overcast, snow, rain, windy, blizzard,
hurricane, tornado`.

Bonsai has **no weather system** — the only "weather" string is a news
copy line. A faithful reimplementation adds a deterministic weather state
driven by the tick/calendar, exposed in the gauge/newspaper, and able to
pair with disasters (blizzard/hurricane/tornado).

## Disasters (MISC 0070)

SC2K disaster ids: `none, fire, flood, riot, toxic spill, buggy air crash,
earthquake, tornado, monster, meltdown, microwave, volcano, firestorm,
mass riots, mass floods, pollution accident, hurricane, helicopter crash,
plane crash`.

Bonsai ships fire/flood/earthquake/tornado/monster. Genuine gaps: riot,
toxic spill, meltdown, microwave spill, volcano, firestorm, mass floods,
pollution accident, hurricane, air/plane crashes.

## Technology discovery years (MISC 0738–0778)

`gas, nuclear, solar, wind, microwave, fusion power; airport, highways,
buses, subways, water treatment, desalination; Plymouth/Forest/Darco/Launch
arcologies`.

Bonsai's facility `tech` gates cover the power plants, treatment, desal,
subway station, and bus. Genuine gap: four distinct arcologies vs one, and
the airport/highway **gates** (SC2K unlocks them by year, Bonsai gates the
placement).

## Budget service funding lines (MISC 0998–0DD0)

`police, fire, health, schools, colleges, roads, highways, bridges, rail,
subway, tunnel` — each an 27-entry month-by-month count+funding history.

Bonsai funds roads/highways/bridges/rail/subway/tunnels in the transit
line and services in their lines. Gap: a per-month funding **history** (the
game lets a player see each month's rate and count).

## Military tile set (XBLD 0xDD–0xF2)

`runway straight, runway cross, parking lot, cargo yard, radar, warehouse,
airport building 1/2, top secret, crane, military control tower`.

Bonsai has military/airport/seaport zones with a simplified install/runway
ground. Gap: the real military base sub-tiles and the offered/refused/army/
air/navy/missile lifecycle (`0E4C`).

## Underground compositing (XUND)

`00 none; 01–0F subway (direction masks as power lines); 10–1E pipes
(direction masks); 1F pipe-TB + subway-LR; 20 pipe-LR + subway-TB; 22 missile
silo; 23 subway-station underground part`.

This is the authoritative continuity / crossing rule: a subway and a pipe
can share a tile, encoded as one of two cross ids — exactly the SC2K
"network crossing is its own tile id, not two sprites stacked" principle,
which also governs road/rail/power crossovers (0x43–0x48) and highway
crossovers (0x4B–0x50).

## Verdict for Bonsai

Highest-value, lowest-risk reimplementations, in order:

1. **Weather** (MISC 0060–006C + 12 types) — deterministic, pure, ticks with
   the calendar, shown in the gauge/newspaper, pairs with disasters.
2. **Underground crossovers** (XUND 1F/20) — make pipe+subway cross a real
   tile id and render it in the underground view (continuity + crossing the
   player asked about).
3. **Tech gates for airport/highways + four arcologies** — SC2K unlocks these
   by year; Bonsai should gate placement the same way and offer the arco
   family.
4. **Military base lifecycle** — offered → army/air/navy/missile.
5. **Per-month funding history** in the budget window.
6. **View memory** (MISC 1014–101C) — reopen a city at the map position the
   mayor left it.

## Implemented (2026-09-04)

Items 1–6 of the verdict are now landed in the MIT-clean Bonsai path, with
the save format advanced to **v4** (migration chain v1→v4; a v3 city gains
safe defaults for the new fields):

1. **Weather** — `weatherOf(state)` derives a type/temperature/wind/humidity
   from seed + calendar, season-weighted, exposed on the render snapshot and
   the gauge; 12 SC2K types.
2. **Underground crossovers** — a pipe and a subway share a tile, both reach
   the underground view, and the chunk signature carries the underground
   flag.
3. **Tech gates** — `TECHS` table exported; airport/seaport zone drags and
   highway/onramp/subway networks check the gate year.
4. **Military base lifecycle** — `militaryBase` state (none/offered/refused/
   army/air/navy/missile) serialized and migrated.
5. **Budget history** — `state.budgetHistory` records one entry per monthly
   settlement (funding/income/expense), serialized to v4.
6. **Arco family** — four concrete kinds (`arco-plymouth/forest/darco/
   launch`) with distinct population/value-bonus, placed after the tier-6
   reward and tallied into `arcoPopulation`; reward landmarks ignore the
   tech gate.

Feature gates covering these live in
`tests/features/bonsai-sc2k-systems.test.mjs` and
`tests/features/bonsai-weather.test.mjs`; all pass.
