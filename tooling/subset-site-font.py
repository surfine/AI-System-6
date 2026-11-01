#!/usr/bin/env python3
"""Subset the official site's Asap to the characters a reader can meet.

The site carries one Latin face (Asap, from the Platinum appearance's font
folder) under a 4 MiB payload budget. The full variable font is 141 KB, most
of it Vietnamese and Latin Extended glyphs the site never sets. This keeps:

  - Basic Latin and the Latin-1 letters (U+00C0-00FF), so any English or
    western-European name typed into the page later still renders in Asap;
  - every other character that appears in the site's own text files.

Chinese text falls through to the system face, as before. `npm run
site:check` fails if site text gains a Latin-range character this subset
lacks; rerun this script then (needs fonttools and brotli):

  python3 -m venv /tmp/ft && /tmp/ft/bin/pip install fonttools brotli
  /tmp/ft/bin/python tooling/subset-site-font.py

The OFL licence names no Reserved Font Name, so the subset keeps the name.
"""
import glob
import json
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, "apps/desktop/assets/fonts/platinum/Asap-Variable.woff2")
TARGET = os.path.join(ROOT, "site/fonts/Asap-Variable.woff2")
# Not shipped: tooling/verify-site.mjs reads it to check new site text.
RECORD = os.path.join(ROOT, "tooling/site-font-subset.json")
TEXT_SUFFIXES = (".html", ".css", ".js", ".mjs", ".json", ".webmanifest", ".svg", ".txt")

text = ""
for path in glob.glob(os.path.join(ROOT, "site", "**", "*"), recursive=True):
    if path.endswith(TEXT_SUFFIXES):
        with open(path, encoding="utf-8", errors="ignore") as handle:
            text += handle.read()

font = TTFont(SOURCE, recalcTimestamp=False)
cmap = set(font.getBestCmap())
keep = ({ord(c) for c in text} | set(range(0x20, 0x7F)) | set(range(0xC0, 0x100))) & cmap

options = subset.Options()
options.flavor = "woff2"
options.layout_features = ["*"]
options.notdef_outline = True
subsetter = subset.Subsetter(options)
subsetter.populate(unicodes=keep)
subsetter.subset(font)
font.flavor = "woff2"
font.save(TARGET)
with open(RECORD, "w", encoding="utf-8") as handle:
    json.dump({
        "source": os.path.relpath(SOURCE, ROOT),
        "target": os.path.relpath(TARGET, ROOT),
        "sourceCodePoints": sorted(cmap),
        "keptCodePoints": sorted(keep),
    }, handle, separators=(",", ":"))
    handle.write("\n")
print(f"{len(keep)} characters, {os.path.getsize(TARGET)} bytes -> {os.path.relpath(TARGET, ROOT)}", file=sys.stderr)
