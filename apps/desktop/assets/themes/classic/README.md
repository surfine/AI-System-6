# Classic (System 6) theme assets

The System 6 appearance owns a complete 56-object **smooth SVG family** under
`icons/`. Real System 6.0.8 resources establish the object silhouette,
proportions, and selection behavior wherever a direct counterpart exists
(for example Startup Device, Finder disks, folders, documents, applications,
and Trash). Product-only objects use the same restrained monochrome grammar
while keeping their documented metaphors. Runtime art is redrawn as smooth
geometry instead of preserving the original bitmap staircase, so it remains
clean on Retina displays.

Each object has independently hinted 32 px and 16 px SVG artwork plus a smooth
black selection mask. Finder selection reveals that mask and reverses the same
artwork to white; it does not swap to a separate selected icon.

Contents of this directory:

- `icons/<id>-32.svg` and `icons/<id>-16.svg`: Retina-safe runtime artwork.
- `icons/<id>-mask-32.svg` and `icons/<id>-mask-16.svg`: smooth Finder
  selection silhouettes.
- `icons/reference/`: native-system inspection crops kept as local evidence
  for agents reproducing a classic object; these are not runtime assets.
- `icons/classic-icon-family.json`: provenance, metaphor, size, and legibility
  ledger for the complete family.

Copyright boundary: runtime SVGs are project-owned geometric reconstructions
based on observation of the preserved System 6 image used for study. Native
raster crops, resource forks, and Apple font binaries remain evidence only and
are not redistributed as product runtime assets.
