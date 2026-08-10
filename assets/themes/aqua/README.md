# Jaguar Aqua icon family

The first reviewed Aqua batch contains twelve objects for Mac OS X 10.2
Jaguar: Finder, Folder, Hard Disk, Trash, Generic Document, Generic
Application, System Preferences, Searcher, TeachText, ClioTalk, Scrapbook, and
Project Hard Disk. Each owns original 128×128, 32×32, and 16×16 PNG artwork.
The smaller files are separate compositions, not reductions of the master.

The remaining 42 semantic ids still use the earlier deterministic SVG family
and are explicitly fallbacks until they pass the same object-by-object review.
The 32 px runtime sprite mixes the accepted PNG core with those fallbacks
without changing semantic ids or sprite positions.

`icons/src/aqua-core-icons.json` pins the twenty-object Jaguar reference board,
material and perspective rules, copyright boundary, and the twelve accepted
prototypes. `icons/aqua-core-icon-family.json` records output metrics and hashes.
`scripts/build-aqua-core-icons.mjs` is the deterministic accepted-core source;
`scripts/build-era-icons.mjs` reapplies it after rebuilding the fallback family.

Historical Apple artwork and screenshots remain evidence-only and are not
packaged as product assets.
