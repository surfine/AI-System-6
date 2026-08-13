# Snow Leopard icon family

This directory ships the complete 56-object Mac OS X 10.6.8 family. Continuity
is defined by each object's `semanticIdentity` and one or two
`identityAnchors` in
[icon-system-continuity.json](../icon-system-continuity.json), not by a fixed
physical metaphor or a reused Aqua composition.

Runtime completeness and `accepted-generated` authoring status do not imply
historical validation. The 40 ids outside `priorityCore16` remain historically
pending until individually reviewed; per-era provenance and review status live
in [icon-provenance-matrix.json](../icon-provenance-matrix.json).

## Actual runtime mapping

The runtime dispatches directly to the per-object PNG that matches the calling
surface: 16 px for mini/menu/control-strip and Finder-list contexts, 32 px for
ordinary system-icon contexts, and 128 px for desktop, large, or Retina
contexts. `snow-leopard-sprite.png` and
`snow-leopard-icon-manifest.json` remain compatibility and review artifacts;
they are not the sole runtime source. The stored 512 px files remain large
review assets. Other compact tiers are deterministic same-master derivatives
unless an object's ledger says otherwise; Finder and MultiFinder own direct
optical constructions at 512/128/32/16.

Theme Lab displays the 16 priority objects and these derivative sizes so their
failures remain inspectable. Display in the lab is not historical acceptance.

## Finder / MultiFinder — P0 closed

Finder uses the approved ImageGen v2 mature 10.6 split face with its curved
black profile divider and is `reference-validated`. MultiFinder composes the
current Snow Leopard Finder identity with multiplicity; it is provenance class
C and `historically-reviewed`, not a native replica. Runtime dispatch selects
their direct optical 16, 32, or 128 px assets by context; the 512 px tier remains
available for large-scale review. None is the old compact-Macintosh derivative.

## Rebuilding

Run:

```sh
npm run build:era-icons -- --theme snow-leopard
```

The chain rebuilds the broad and measured layers, restores the accepted
generated family, applies the approved Finder-lineage overlay, refreshes the
compatibility sprite and manifest, and regenerates review sheets. A core-only
build remains an intermediate diagnostic.

Local 10.6 resources and captures remain evidence-only. Exported iconsets must
also be checked against a real 10.6.8 capture before supporting a period claim.
