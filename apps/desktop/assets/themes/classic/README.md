# Classic (System 6) icon family

This directory ships the complete 56-object Classic runtime family. The stable
contract is each object's `semanticIdentity` plus one or two
`identityAnchors` in [icon-system-continuity.json](../icon-system-continuity.json).
The older `metaphorKey` is only a deprecated migration hint; it must not freeze
one physical object or composition across all six appearances.

Family completeness means every runtime id resolves to artwork and a selection
mask. It does not mean that every icon has passed historical review. Generated,
technically clean, or accepted authoring states are not historical evidence.
The 40 ids outside `priorityCore16` remain historically pending until they are
reviewed individually; stronger status for a priority object is recorded per
era in [icon-provenance-matrix.json](../icon-provenance-matrix.json).

## Smooth Retina project exception

Classic deliberately uses smooth monochrome SVG at runtime for modern Retina
displays. This is a project-direction exception to literal bitmap rendering,
not permission to invent generic vector anatomy. Where a System 6.0.8 resource
exists, the native one-bit evidence still owns silhouette, occupied bounds,
relative proportions, asymmetry, internal landmarks, and selection behavior.
Smoothing changes edge expression only.

The build therefore keeps two distinct layers:

- `icons/classic-core-icon-family.json` and the native reference boards record
  the exact one-bit evidence layer. It is comparison authority, not runtime art.
- `icons/<id>-32.svg` and `icons/<id>-16.svg` are separate, optically tuned
  smooth runtime drawings; matching `-mask-` files own Finder inversion.

An exact-replica claim requires an explicit overlay or diff. Otherwise the
honest label is reference-guided reconstruction. Product-only objects may use a
generated-model candidate to accelerate composition work, but the accepted SVG
still needs period evidence and historical review.

## Finder provenance

Classic Finder is complete as a smooth, reference-guided runtime reconstruction:
native evidence owns its anatomy, while the SVG remains explicitly non-pixel-
identical. MultiFinder has native functional evidence but no native icon
resource. Its artwork therefore remains a provenance-class C, period-plausible
translation of the current Finder identity plus multiplicity, never a claimed
native replica. Finder is `reference-validated`; MultiFinder is
`historically-reviewed`.

## Runtime and build order

The runtime selects the authored 16 px SVG in compact contexts and the 32 px
SVG otherwise. Selection reveals the separate mask and reverses the same art;
there is no selected bitmap.

Run:

```sh
npm run build:classic-icons
```

That command runs `tooling/build-classic-core-icons.mjs` first to rebuild the
evidence layer, then `tooling/build-classic-family-icons.mjs` writes the smooth
runtime family. Use `npm run build:icon-provenance-matrix` and
`npm run build:icon-lineage-audit` after the assets and review statuses settle.

Historical raster crops, resource forks, screenshots, and Apple fonts remain
evidence-only and are not redistributed as product runtime assets.
