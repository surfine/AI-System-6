# Platinum icon family

This directory contains the progressive Mac OS 9-era Platinum icon system.
The accepted batch is thirteen core objects: Finder, Folder, Hard Disk, Trash,
Generic Document, Generic Application, Floppy, CD, Control Panel, System,
Scrapbook, Clipboard, and ClioTalk. ClioTalk joined when its generated fallback
(an envelope, which states mail rather than a conversation kept as a file) was
replaced by the clipped transcript the other appearances use. Each owns independently composed 32×32 and
16×16 PNG artwork. The 16px files are not reductions of the 32px files.

The pre-existing 54-object SVG family remains available only as fallback while
the remaining objects are reviewed. `platinum-icon-family.json` identifies the
reviewed members; it must not be read as evidence that every fallback has
passed the new historical acceptance bar.

The construction is limited to compact physical desktop metaphors, selective
dark keylines, a small Mac OS 9-like palette, upper-left one-pixel highlights,
and lower-right structural shade. CSS owns placement and selection only; it
does not add a retro filter or theme-wide shadow.

`icons/src/platinum-core-icons.json` fixes the reference board, measurement
rules, source pins, and copyright boundary. `icons/platinum-core-icon-family.json`
records each accepted object's prototype, native files, bounds, palette count,
and SHA-256. `tooling/build-platinum-core-icons.mjs` is the accepted-core source;
the broad `tooling/build-era-icons.mjs` reapplies it last so a full rebuild
cannot replace the core with legacy artwork.

Run `npm run build:platinum-core-icons` to rebuild the core. Inspect the result
in Theme Lab at normal/selected 32px and 16px, three Finder backgrounds, and
100/200/400 percent nearest-neighbor zoom. The generated boards are:

- `internal/evidence/drafts/era-icons/platinum-core-reference-board.png`
- `internal/evidence/drafts/era-icons/platinum-core-contact-sheet.png`
- `internal/evidence/drafts/era-icons/platinum-core-comparison-board.png`

Evidence is also summarized in `../era-icon-reference.json`. Historical
screenshots and Apple resources remain evidence-only. No screenshot crop,
extracted Apple bitmap, traced Apple path, or embedded historical resource is
used as a runtime icon.
