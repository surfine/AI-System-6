# Real-file corpus (ClioWorks R1)

32 real office files from public sources: 12 docx, 10 xlsx, 6 pptx, 4 pdf. They come from different producers (WPS Office, Word 12/14/16 on Windows and Mac, Excel, LibreOffice, PowerPoint) and answer one question: do the desk's ClioWrite, ClioChart workbook and ClioStage cope with files other people actually saved? `manifest.json` records each file's id, size, sha256, producer, language, use, download URL, source page and licence.

## Licences

Each file's licence is in the `license` field of `manifest.json`, which is authoritative. The government and school files carry no explicit open licence: they are for internal testing only and must not be redistributed — keep them out of public repositories, release packages, the site and demo disks. The PDFs are stored and recorded as `pending: "N1"` until stage N1.

## Automatic checks

`node tooling/clioworks-r1-corpus.mjs` does three things to every docx/xlsx/pptx, through the vendored codecs and adapters the desk actually uses:

1. it opens without an error;
2. saving without a change gives bytes identical to the original (sha256);
3. after one minimal edit (ClioWrite: one character of the first body text run; workbook: the first non-formula text cell; ClioStage: one character of the first text box) the saved result is still a valid package — the zip reads, its XML is well-formed, content types and relationships resolve, and nothing is newly wrong compared with the original.

A file the desk refuses or cannot edit (for example a docx that is only a table, since ClioWrite tables are read-only) is recorded as a failed check; product code is not changed to make it pass. `tests/features/clioworks-r1-corpus.test.mjs` runs compare mode: only a regression — true in the baseline, false now — fails it. It also checks every file's sha256, licence and source.

`--lo` converts each edited file to PDF with headless LibreOffice when `soffice` is installed and records `lo_open`, otherwise `not_run`. `--reencode` also records whether "edit, edit back, save through the encoder" reproduces the original (an untouched save returns the original bytes, so only this shows how faithful the encode path is).

## Updating the baseline

After fixing a problem or deliberately changing behaviour:

```
node tooling/clioworks-r1-corpus.mjs --write-baseline
```

This reruns every file (with LibreOffice and reencode) and rewrites `baseline.json`. Commit the changed rows with the reason; the baseline should only move towards more checks being true. To add a file, update `manifest.json` first (sha256, source, licence), then rewrite the baseline.

## The manual half: does Microsoft 365 open it without repair?

The automatic checks cannot answer this. Open each "edited once and saved" file in Microsoft 365 (Word, Excel, PowerPoint) and confirm there is no "found unreadable content, repair?" prompt. Export them with:

```
node tooling/clioworks-r1-corpus.mjs --export-edited <dir>
```

Start with the producers furthest from Microsoft 365: WPS-produced D01, D02, D08; LibreOffice-produced X15; Mac Office D11, D12, X07, X11, P05, P09. Go through the other docx/xlsx/pptx too; PDFs are out of scope. For files with nothing the desk can edit (rows with `edited_valid` false in `baseline.json`) no edited copy is exported: open the original instead and confirm it opens.
