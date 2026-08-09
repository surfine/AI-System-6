# Platinum Theme Lab painters

These small SVG painters are original AI System 6 assets. Their palette,
pixel grid, and object scale were calibrated against the Mac OS 9 Finder,
Open dialog, and alert screenshots listed in `DESIGN.md`; they are not copies
of Apple resource-fork artwork.

The painters are intentionally limited to the Theme Lab evidence surface.
Application icons keep their existing semantic IDs and shared DOM.

## Fixture evidence and licensing boundary

The checked-box overlay was measured at native 1× from the canonical
`checkbox-checked-reference.png` tile. Its 12×12 painter records the 9×8
checkmark runs and the two light corner repairs as discrete rectangles; it
contains no raster payload or screenshot crop.

The selected-tab left and right painters were measured at native 1× from the
canonical `selected-tab-reference.png` tile. Each 14×24 SVG reconstructs only
the fixed bevel edge with integer rectangles. The center label and source
pixels are not embedded, cropped, traced, or redistributed; three label pixels
touching the left slice were deliberately excluded and replaced by the measured
interior fill. The intended stretch center is a five-band vertical fill:
`#ddd` at row 0, `#000` at row 1, `#ccc` at row 2, `#fff` at row 3, and
`#eee` for rows 4–23. The selected tab has no horizontal bottom rule because it
opens directly into the active tab panel.

The 32px Calculator painter was calibrated against the native-size Calculator
alert in GUIdebook's Mac OS 9 gallery. The reference occupies 21×32 pixels in a
32px icon slot. This file preserves that scale, display/key hierarchy, and
Platinum gray/lavender palette while redrawing the casing and key grid as an
AI System 6 asset.

The 13 Apple-menu painters were measured from the gallery's 199px-wide menu
capture. They preserve each row's semantic silhouette, 16px density, hard
pixel grid, and limited era palette. They are original simplified painters,
not transcriptions of Apple resource-fork bitmaps. The five Open-list files
intentionally share one painter because all five rows in the native-size Open
panel reference visibly use the same application-list silhouette.

Local measurement sources (kept under ignored `drafts/`, never redistributed
as product assets):

- `drafts/theme-lab-fidelity/platinum/tiles/checkbox-checked-reference.png`
- `drafts/theme-lab-fidelity/platinum/tiles/selected-tab-reference.png`
- `drafts/theme-lab-fidelity-cache/platinum/guidebook-about-application-macos90.png`
- `drafts/theme-lab-fidelity/platinum/tiles/apple-menu-reference.png`
- `drafts/theme-lab-fidelity-cache/platinum/guidebook-openfile-macos90.png`

Public reference page: <https://guidebookgallery.org/screenshots/macos90>

All SVGs in this directory are project-owned measured reconstructions. They
use transparent vector rectangles only: no embedded images, data URIs,
traced paths, extracted Apple resources, or redistributed Apple fonts.
