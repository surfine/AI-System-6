# Liquid Glass icon family

This directory contains the complete 56-object macOS Tahoe 26 appearance for
AI System 6. Every semantic object has an independently generated transparent
Image Gen master; no Apple asset, screenshot crop, or traced path ships as an
icon.

## Runtime and size policy

The reviewed runtime source is each object's `128-default` PNG. Runtime
surfaces downsample that asset to their CSS display size. The 64, 32, and 16 px
files, plus Dark and Clear appearances, are deterministic Theme Lab review
derivatives produced from the same master. They are useful for inspecting
resampling and material behavior, but they are not separately authored small
artwork and are not included in the packaged runtime asset list.

This is the deliberately honest resolution for the current family: it avoids
claiming mechanical reductions are native compositions. A future separately
authored compact family must replace both this policy and its pixel-level gate,
not merely change a builder comment.

## Material and containers

Application objects may use a system rounded-square enclosure. Finder objects,
media, folders, documents, hardware, trash, and the Control Strip remain
free-form. There is no family-wide “gradient tile plus white glyph” template.
The visual language is thin optically clear glass, restrained highlights,
blue-silver edge refraction, and simple foreground layers that remain legible
when the reviewed 128 px source is reduced by the runtime.

## Continuity

All 56 objects keep the cross-era meaning recorded in
[icon-system-continuity.json](../icon-system-continuity.json). In particular,
DocMap is a document page whose heading lines grow into a stem and branches,
not a geographic map or a page-less node graph. Finder remains a smiling
compact Macintosh, and ClioTalk remains the solid user balloon with a dashed
provisional reply.

## Files and rebuilding

- `icons/src/liquid-glass-imagegen-prompts.json` — one independent prompt per
  semantic object, provenance, and the size policy.
- `liquid-glass-icon-family.json` — per-object source, sizes, byte metrics, and
  semantic measurements.
- `liquid-glass-icon-manifest.json` — the 128 px Default runtime mapping.
- `scripts/build-liquid-glass-imagegen-icons.mjs` — deterministic derivatives,
  manifests, and proof boards built from accepted transparent masters.

Run `npm run build:liquid-glass-imagegen-icons` to rebuild this family. Theme
Lab retains the 64/32/16 and Dark/Clear derivatives for comparison over light,
dark, photographic, and high-frequency backgrounds. The application package
ships only the 56 runtime-reachable `*-128-default.png` files.

## Evidence and limits

Local Tahoe 26 research evidence lives in the git-ignored
`drafts/liquid-glass-reference/` directory. Static PNGs cannot refract the live
desktop behind them; review therefore checks legibility over representative
backgrounds. Toolbar and sidebar symbols remain a separate family.

Every object uses the shared grid in
[icon-grid.mjs](../../../scripts/lib/icon-grid.mjs). Placement is uniform and
object proportions are preserved; the shared grid targets are not changed by
this family.
