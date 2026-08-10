# Snow Leopard icon family

This directory contains the complete 54-object AI System 6 icon family for
Mac OS X 10.6.8. Every id owns 512×512, 128×128, 32×32, and 16×16 artwork.
The 32px and 16px files are separately simplified hints rather than one large
image scaled by the browser.

Snow Leopard has its own geometry and painter. It uses mature OS X object
compositions, controlled saturation, restrained overhead light, denser material
detail, and object-owned shadows. It does not recolor or desaturate the Jaguar
family, and no theme-wide CSS filter supplies its depth.

`snow-leopard-icon-manifest.json` maps the 32px runtime sprite.
`snow-leopard-icon-family.json` records every size, genre, physical metaphor,
and semantic mark. `scripts/build-era-icons.mjs` is the deterministic source.

Evidence and the sRGB review boundary are recorded in
`../era-icon-reference.json`. Original `.icns`, Apple bitmaps, screenshot crops,
and Quaqua artwork are evidence-only and do not ship in these files.
