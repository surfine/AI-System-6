# Platinum icon family

This directory ships the complete 56-object Mac OS 9-era Platinum runtime
family. Cross-era continuity is defined by `semanticIdentity` plus one or two
`identityAnchors` in
[icon-system-continuity.json](../icon-system-continuity.json), not by a fixed
physical metaphor. `metaphorKey` remains only as a deprecated migration hint.

Runtime completeness is separate from historical validation. `accepted-imagegen`
means that generated art passed the authoring pipeline; it does not mean that
the result matches Mac OS 9. The 40 ids outside `priorityCore16` remain
historically pending until individually reviewed. Per-object provenance and
review status live in
[icon-provenance-matrix.json](../icon-provenance-matrix.json).

## Actual runtime mapping

The official family is the accepted ImageGen PNG set under `icons/`, with the
approved Finder-lineage overlay applied last.
`platinum-icon-manifest.json` retains the stable 32 px compatibility mapping,
while the inline system-icon runtime selects `icons/<id>-16.png` for compact,
`-32.png` for regular, and `-42.png` for desktop contexts. Those files are
separate reductions of the accepted high-resolution redraw; the 16 and 32 px
files are derivatives unless an object's ledger says otherwise. Finder and
MultiFinder are the reviewed exception: the approved builder renders each
target canvas directly with size-owned bounds and contrast.

Compatibility SVGs remain so older paths resolve. Theme Lab displays the 16
priority objects and the same PNG review tiers, but appearing in Theme Lab is
not an approval state.

## Finder / MultiFinder — P0 closed

Finder uses the approved ImageGen v2 Mac OS 9 lavender folder with a lower-left
Finder face panel and is `reference-validated`. MultiFinder composes two
current-era Finder identities to express multiplicity; it is provenance class C
and `historically-reviewed`, not a native replica. Their 42/32/16 assets are
direct optical runtime constructions from the approved source, not the old
compact-Macintosh derivatives.

## Rebuilding

Run the complete theme chain with:

```sh
npm run build:platinum-icons
```

The chain rebuilds the broad family and measured core, restores the accepted
Platinum ImageGen family, then applies the approved Finder-lineage overlay as
the final runtime step and regenerates its review sheets. A core-only build is
an intermediate diagnostic, not the final runtime family. After review statuses
change, regenerate the provenance matrix and lineage audit.

Historical screenshots and Apple resources remain evidence-only; no extracted
Apple bitmap is shipped as a runtime icon.
