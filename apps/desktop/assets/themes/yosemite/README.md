# Yosemite icon family

This directory ships the complete 56-object OS X 10.10 family. Stable cross-era
meaning is defined by `semanticIdentity` plus one or two `identityAnchors` in
[icon-system-continuity.json](../icon-system-continuity.json). The deprecated
`metaphorKey` must not carry one physical object through every era.

Runtime coverage is separate from historical validation. The broad family's
`accepted-generated` state is an authoring decision only. The 40 ids outside
`priorityCore16` remain historically pending until individually reviewed;
object and era status live in
[icon-provenance-matrix.json](../icon-provenance-matrix.json).

## Actual runtime mapping

The runtime dispatches directly to the per-object PNG that matches the calling
surface: 16 px for mini/menu/control-strip and Finder-list contexts, 32 px for
ordinary system-icon contexts, and 128 px for desktop, large, or Retina
contexts. `yosemite-icon-manifest.json` remains a compatibility and review
mapping, not the sole runtime source. The stored 64, 32, and 16 px files are
deterministic derivatives unless an object's ledger says otherwise. Finder and
MultiFinder own direct optical runtime constructions at every listed size;
Review Desk, Searcher, and ClioTalk own reviewed priority-lineage replacements
with independent compact artwork.

Theme Lab shows the 16 priority objects and the derivative sizes to expose
small-size failure; it does not confer historical approval.

## Finder / MultiFinder — P0 closed

Finder uses the approved ImageGen v2 lower, wider Yosemite blue/light split face
and is `reference-validated`. MultiFinder composes the current Yosemite Finder
identity with multiplicity; it is provenance class C and
`historically-reviewed`, not a native replica. Their 128/64/32/16 assets are
direct optical runtime constructions, not the old compact-Macintosh
derivatives.

## ClioTalk — Yosemite cell closed

ClioTalk now uses a P-B free-form transcript sheet with two distinct
interlocutor marks and a separate provisional-reply tab. Its 32 and 16 px
files are optical redraws, not reductions of the generated master. It is
`historically-reviewed`, not `reference-validated` or a native replica, and
its blind-mix status remains `not-run`. Platinum, Jaguar, and Snow Leopard
ClioTalk remain pending; this Yosemite result does not upgrade them.

## Rebuilding

Run:

```sh
npm run build:era-icons -- --theme yosemite
```

The chain rebuilds broad and measured layers, restores the accepted generated
family, applies the approved Finder-lineage overlay to every runtime tier, and
regenerates the compatibility manifest and review sheets. A core-only build is
an intermediate diagnostic.

Historical 10.10 captures and Apple artwork remain evidence-only. Theme Lab
must judge every derivative at its actual display size.
