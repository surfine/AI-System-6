# Liquid Glass icon family

This directory ships the complete 56-object macOS Tahoe 26 family. Cross-era
continuity comes from each object's `semanticIdentity` plus one or two
`identityAnchors` in
[icon-system-continuity.json](../icon-system-continuity.json), not from a fixed
enclosure or physical metaphor.

The family has accepted transparent ImageGen masters, but authoring acceptance
is not historical validation. The 40 ids outside `priorityCore16` remain
historically pending until individually reviewed; per-object provenance and
status live in
[icon-provenance-matrix.json](../icon-provenance-matrix.json).

## Actual runtime mapping

Runtime dispatch selects the per-object, per-appearance PNG for the calling
surface: 16 px for mini/menu/control-strip and Finder-list contexts, 32 px for
ordinary system-icon contexts, and 128 px for desktop, large, or Retina
contexts; explicit 64 px callers and Theme Lab use the 64 px tier. For 52
objects these stored tiers and their Dark/Clear appearances remain
deterministic derivatives of baked ImageGen sources, but runtime does not
downsample one 128-default file for every context. Finder, MultiFinder, Review
Desk, and ClioTalk are reviewed exceptions with direct optical runtime
constructions. Finder owns auditable `base`/`panel`/`ink` sources; Review Desk
owns `backing`/`manuscript`/`correction`; ClioTalk owns
`enclosure`/`panel`/`conversation`/`provisional`. That layer credit does not
extend to MultiFinder or the other 52 objects.

Theme Lab displays the 16 priority objects. Its 16 px hint correctly reads
`icons/<id>-16-default.png`. Finder and MultiFinder use accepted optical runtime
assets there; Review Desk and ClioTalk also use accepted optical compact art;
other objects remain derivative review artifacts. Static PNGs
also cannot refract the live desktop behind them.

## Finder / MultiFinder — P0 closed

Finder uses the approved ImageGen v2 Tahoe blue enclosure with a separate
translucent face/profile panel and ink. Its independent `base`, `panel`, and
`ink` sources recompose the authored identity, and its historical status is
`reference-validated`. MultiFinder composes the current Tahoe Finder identity
with multiplicity; it is provenance class C and `historically-reviewed`, not a
native replica. Both own direct 128/64/32/16 optical runtime assets across
Default, Dark, and Clear.

## ClioTalk — Tahoe cell closed

ClioTalk now uses a P-B layered glass conversation panel. Two distinct
interlocutor marks form the conversation layer, while the provisional reply is
a separate source—not a dashed edge baked into a generic messaging glyph.
`enclosure`, `panel`, `conversation`, and `provisional` canvases are authored
at 128, 64, 32, and 16 px and exactly recompose the Default runtime image at
every tier. The result is `historically-reviewed`, not reference-validated or
native, and its blind-mix status remains `not-run`.

## Rebuilding

Run the complete family chain with:

```sh
npm run build:era-icons -- --theme liquid-glass
```

The chain rebuilds the broad ImageGen family and then applies the approved
Finder-lineage overlay as the final runtime step. Running only
`build:liquid-glass-imagegen-icons` is an intermediate broad-family build, not
the final Finder-lineage state. Regenerate the provenance matrix and lineage
audit after review statuses change.

Historical Tahoe captures remain evidence-only; no Apple artwork, screenshot
crop, or traced Apple path ships as a product icon.
