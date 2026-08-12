# Jaguar Aqua icon family

This directory contains the complete 56-object Mac OS X 10.2 Jaguar
appearance for AI System 6. Every semantic object keeps the cross-era
`metaphorKey` recorded in
[icon-system-continuity.json](../icon-system-continuity.json), while its
materials, lighting, and perspective follow the Jaguar reference world.

## Runtime and size policy

The runtime manifest maps every object to its 32 px PNG. The 128 and 16 px
files retained in the repository are deterministic Theme Lab review
derivatives produced from the accepted master. They are useful for inspecting
resampling and material behavior, but they are not separately authored small
artwork. The packaged app carries every declared review size so Theme Lab never
falls back to an absent or older asset.

All 56 user-facing objects are the accepted generated family. The earlier
measured core remains only as a deterministic reconstruction layer; the
accepted overlay always runs last, and the final family rejects `accepted-core`
or fallback pixel residue.

This is the deliberately honest policy for the current family: mechanical
reductions are review evidence, not native compact compositions. A future
separately authored compact family must replace this policy and its pixel
checks, not merely rename the derivatives.

## Files and rebuilding

- `aqua-icon-manifest.json` — the complete 56-object, 32 px runtime mapping.
- `aqua-icon-family.json` — per-object provenance, sizes, metrics, and review
  status; the family is complete and has no fallback objects.
- `icons/imagegen-source/` — checked-in accepted generated sources used by the
  deterministic overlay rebuild.
- `tooling/build-aqua-core-icons.mjs` and
  `tooling/build-accepted-generated-era-icons.mjs` — rebuild the historical
  measured layer and then reapply all 56 accepted generated objects without
  changing semantic ids.

Theme Lab reads every repository size directly from the working tree. The
application package ships every declared Theme Lab tier; the checked-in
`imagegen-source` provenance archive remains development-only. Aqua desktop
sprites are rebuilt from the 128 px tier for Retina display, while the 32 px
manifest keeps stable semantic ordering and compatibility.

Historical Apple artwork and screenshots remain evidence-only and are not
packaged as product assets.

## Grid

Every object sits on the shared icon grid in
[icon-grid.mjs](../../../../../tooling/lib/icon-grid.mjs). Scaling is uniform, never
a stretch, and each object keeps its proportions and optical allowance. The
pipeline records placement per object in the family JSON; this family does not
change the shared grid.
