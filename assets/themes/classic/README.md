# Classic (System 6) theme assets

The System 6 appearance intentionally owns almost no raster or vector assets:
its icons are **inline 1-bit SVG paths** in `app/core/system-icons.js`, encoded
losslessly from the bundled System 6.0.8 image's resource forks (e.g.
Startup Device ICN# -4064, Finder ICN# 129, Trash ICN# 130/134). This keeps
the default theme's pixel grid, 1-bit inversion rules, and glyph size
relationships exactly as the original system drew them, with no raster file
to stretch or resample.

Contents of this directory:

- `icons/reference/`: native-system inspection crops kept as local evidence
  for agents reproducing a classic object. These are reference material, not
  product runtime assets; the product ships the SVG encodings in
  `app/core/system-icons.js`.

Copyright boundary: the SVG paths are lossless currentColor encodings of the
observed System 6 resource pixels (project-owned reconstructions of
historical system art, drawn from the preserved emulator image the project
licenses/bundles for study). No Apple font binaries, raster crops, or
resource forks are redistributed as product assets. Classic Plus variants
and any future Classic-era painter follow the same rule: encode measured
pixels, never ship extracted Apple files.
