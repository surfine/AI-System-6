# IsoCity Research Notes

Pinned research record for the original city simulator's reference landscape.
This file is not a specification and nothing in it is a template for
implementation. It records what the MIT-licensed IsoCity project demonstrates
and where the boundary for the Bonsai path sits.

## Baseline

- Repository: `amilich/isometric-city` (IsoCity)
  - License: MIT (© 2025 amilich)
  - Stack: a pure-Canvas 2D isometric city builder (no WebGL, no Next.js in
    this project's path)
  - Demonstrated ideas: painter-order depth sorting, layered canvas sprites,
    per-tile RCI zoning and growth, an economy, vehicle/pedestrian traffic,
    and multiple saved cities.

## What is adoptable (public ideas only, independent wording)

- Keep the simulation model separate from the draw pass; the renderer consumes
  a read-only snapshot instead of owning mutable city cells.
- Sort drawables by depth so taller sprites occlude the tiles behind them.
- Represent zones as stage-scaled buildings and roads as a distinct layer, so
  growth and traffic read clearly at a glance.
- Treat traffic as visible agents/decoration derived from the simulation's
  congestion data, never as a second source of truth.

## What is not adopted

- IsoCity's exact code, file structure, and identifiers are not copied or
  ported into the Bonsai path. Bonsai prefers its own first-principles
  implementation and does not introduce Next.js.
- No assets are imported from IsoCity; the voxel atlas is original.

## Rules

- The MIT license permits study and independent reimplementation, but the
  Bonsai path stays original and MIT-clean. Cite ideas, do not copy code.
- Recorded decisions land in `foundation-contract.json` and the scoped
  `AGENTS.md`; keep no private copies of IsoCity facts in implementation files.
