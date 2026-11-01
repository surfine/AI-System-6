# Jaguar Aqua icon family

This directory ships the complete 56-object Mac OS X 10.2 Jaguar family.
Cross-era continuity is each object's `semanticIdentity` plus one or two
`identityAnchors` in
[icon-system-continuity.json](../icon-system-continuity.json), not a fixed
`metaphorKey`, enclosure, silhouette, or material recipe.

Runtime completeness does not mean complete historical review.
`accepted-generated` describes authoring and technical acceptance only. The 40
ids outside `priorityCore16` remain historically pending until individually
reviewed; provenance and status are recorded per object and era in
[icon-provenance-matrix.json](../icon-provenance-matrix.json).

## Actual runtime mapping

The runtime dispatches directly to the per-object PNG that matches the calling
surface: 16 px for mini/menu/control-strip and Finder-list contexts, 32 px for
ordinary system-icon contexts, and 128 px for desktop, large, or Retina
contexts. `aqua-sprite.png` and `aqua-icon-manifest.json` remain compatibility
and review artifacts; they are not the sole runtime source. Repository 32 and
16 px files are deterministic derivatives unless an object's ledger says
otherwise; Finder and MultiFinder own direct optical runtime constructions at
both compact sizes.

Theme Lab shows the 16 priority objects at 128, 32, and 16 px so derivative
failure is visible. It does not promote a derivative or an accepted generation
to historical approval.

## Finder / MultiFinder — P0 closed

Finder uses the approved ImageGen v2 low rectangular Jaguar split-face plaque
and is `reference-validated`. MultiFinder composes the current Jaguar Finder
identity with multiplicity; it is provenance class C and
`historically-reviewed`, not a native replica. Runtime dispatch selects their
direct optical 16, 32, or 128 px assets by context; these are not the old
compact-Macintosh derivatives.

## Rebuilding

Run:

```sh
npm run build:era-icons -- --theme aqua
```

The chain rebuilds the broad and measured layers, restores the accepted
generated family, applies the approved Finder-lineage overlay, refreshes the
compatibility sprite and manifest, and then regenerates review sheets. A
core-only build is an intermediate diagnostic, not the final runtime family.

Historical Apple artwork and screenshots remain evidence-only and are not
packaged as product runtime assets.
