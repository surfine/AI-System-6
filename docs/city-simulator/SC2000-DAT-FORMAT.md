# SC2000.DAT container — research notes

Pinned research record for the original city simulator's reference
landscape. This file is not a specification and nothing in it is a template
for implementation beyond the independently written reader in
`apps/desktop/app/features/bonsai-sc2000-reader.js`.

## Baseline

- The classic (MS-DOS) SimCity 2000 ships its data inside one container,
  `SC2000.DAT`. The same container layout is what the compact 2 MB package
  (SC2000_2Mb) uses.
- Public format facts, attributed:
  - Krusher, *Taking Sim City 2000 into pieces* (2017), CC BY-SA:
    documents the 16-byte directory records and the file type set.
  - C. Cawley, *Sim City 2000 SC2000.DAT unpacker* (QuickBMS script):
    independently confirms the directory count derivation and file sizing.
- The Windows 95 releases use a different art container (`LARGE.DAT`) plus a
  master palette/sprite sheet (`PAL_MSTR.BMP`). Both files are present on the
  Windows 95 disc under `SC2K/DATA/LARGE.DAT` and `SC2K/BITMAPS/PAL_MSTR.BMP`
  and are covered by the sprite-file facts below.

## Container facts

1. No global header. A directory of 16-byte records starts at byte 0.
2. Each record:
   - bytes 0–11: file name, MS-DOS 8.3 convention, NUL padded;
   - bytes 12–15: little-endian uint32 offset of that entry's first byte.
3. The directory occupies exactly `firstOffset` bytes (the first record's
   offset equals the directory length, and each record is 16 bytes).
4. A file's size is the gap between its offset and the next entry's offset;
   the last entry ends at EOF. Names may repeat, aliasing one region.
5. Member types seen in the inspected package: `*.RAW` (headerless indexed
   image data), `*.DAT` (nested archives), `*.HED` (per-tile indexes),
   `*.VOC` (sound), `*.XMI` (music), and extensionless `TXT*` text records.

## What may be adopted

Only the layout facts above, written in our own words, plus the tiny
independent reader. No member file content — palette bytes, tile bytes,
audio, or text — is copied, transformed, or committed anywhere in this
repository. The reader is tested against synthetic containers only.

## Windows 95 sprite files (`LARGE.DAT`, `SMALLMED.DAT`, `SPECIAL.DAT`)

Clean-room facts verified 2026-09-04 against the disc copy, consistent with
the OpenCity2k/SC2k-docs sprite specification (CC BY-SA 4.0):

1. The file is big-endian. Byte 0 holds a 2-byte sprite count; the header then
   carries that many 10-byte records: sprite id (2B), absolute chunk offset
   (4B), height px (2B), width px (2B). Header length = 2 + count × 10, and
   the first record's offset equals that header length.
2. Sprite data is a run of 2-byte (count, mode) pairs. Mode 1 begins a new
   row; mode 2 ends the sprite; mode 3 skips `count` transparent pixels;
   mode 4 writes `count` palette-index pixels (odd runs carry one pad byte);
   mode 0 is ignored.
3. Palette indices address a 16×16 colour grid stored in `PAL_MSTR.BMP`:
   the high nibble selects the row, the low nibble the column.
4. Verification: parsing the disc's `LARGE.DAT` (681 180 bytes) yields 501
   records with strictly increasing offsets; 499 sprites decode to non-empty
   rows; the final record ends exactly at EOF.

The independent reader `bonsai-large-dat-reader.js` implements facts 1-2 and
is tested with synthetic files only.

## Boundary

- The reader and these notes stay in the MIT-clean Bonsai path because they
  carry no Maxis/EA expression.
- `SC2000.DAT`, `LARGE.DAT`, `PAL_MSTR.BMP`, and every member they contain
  remain runtime-only reference material; they are never committed or
  bundled.
