# Yosemite icon family

This directory contains the complete 54-object AI System 6 icon family for
OS X 10.10 Yosemite. Every id owns 128×128, 64×64, 32×32, and 16×16 artwork.

The Yosemite painter is independent of Liquid Glass. It uses flat Retina-era
object silhouettes, light steel-blue hairlines, shallow color planes, minimal
shading, and compact optical centers. It is not a uniform outline-glyph pack,
does not place every app in a squircle, and does not inherit glass pills,
refraction, or Liquid Glass geometry.

`yosemite-icon-manifest.json` maps the runtime 32px files.
`yosemite-icon-family.json` records every size and metaphor.
`scripts/build-era-icons.mjs` is the deterministic source.

Evidence is recorded in `../era-icon-reference.json`. Historical Apple and GTK
assets remain evidence-only; none are embedded, cropped, traced, or shipped.
