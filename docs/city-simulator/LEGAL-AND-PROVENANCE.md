# Bonsai City — License and Provenance

This file is the construction rule for what may enter the original Bonsai City
path. It is a conservative engineering boundary, not legal advice.

## The one-line rule

The Bonsai City path stays MIT-clean: original code and original assets only,
written from public, non-copyrightable ideas and first principles.

## Boundary table

| Material | Allowed | Forbidden |
| --- | --- | --- |
| OpenSC2K (GPL v3) | Read, record high-level facts, cite a pinned commit | Copy, port, approximate-rewrite, extract tests/enums/tables/flows/structure |
| micropolisJS (GPL v3 + terms) | Keep as a separate lazy vendor game payload | Any contribution to the Bonsai path; trademark "MICROPOLIS" is licensed only to that project |
| OpenTTD (GPL v2), DOOM | Separate game payloads | Any contribution to the Bonsai path |
| Original MIT/ISC upstreams | Future use only after separate review from the original upstream, with license retained | Back-port from GPL adaptations of those upstreams |
| SC2k-docs (CC BY-SA 4.0) | Cite with attribution; record independently worded protocol facts | Verbatim text, tables, diagrams, or extracted data |
| Maxis / EA / SimCity 2000 | State the boundary | Code, sprites, palettes, sounds, copy, cities, scenarios, screenshots, brand assets, converted data, traced artwork |
| `.SC2` fixtures (NEWCITY, TESTCITY, etc.) | Nothing | Committing, referencing, or shipping them |
| AI System 6 MIT code | Everything in the original path | Absorbing GPL code to keep an MIT file |
| Original art/sound/copy/data | Create and register in a provenance manifest (author, date, tool, license, source) | Tracing original outlines, palettes, tiles, sounds, or copy |

## Practical guards

- The Bonsai simulation core is headless and self-contained; it must never
  `import` or concatenate GPL vendor engines.
- If a requirement looks like it needs OpenSC2K or an original-game resource,
  re-derive it from first principles instead of reaching for a forbidden
  source.
- Public format facts may be recorded in independently worded notes
  (see [OPENSC2K-RESEARCH.md](OPENSC2K-RESEARCH.md)); verbatim extraction is
  not.
- Any new runtime asset needs a provenance entry before merge.
- The voxel texture atlas is registered at `assets/bonsai/provenance.json`
  (author, date, tool, MIT license, `source: original`); the build tool
  `tooling/build-bonsai-atlas.mjs` regenerates it from hand-authored 16x16
  grids and never reads an external art source.

## Naming

- "Bonsai City / 盆景城市" is the current working name, not yet approved.
- Do not use "SimCity", "OpenSC2K", "Micropolis", or Maxis/EA names for the
  original product. "MICROPOLIS" is a registered trademark of Micropolis GmbH
  and belongs to the separate GPL game line only.

## Enforcement

`tests/features/city-simulator-foundation.test.mjs` scans the original path
for `Math.random`, references to the separate GPL game engines, `.SC2`
fixtures, and unapproved registration or schema changes. The scoped AGENTS
file makes these rules the standing instruction for any agent.
