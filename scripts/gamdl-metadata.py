#!/usr/bin/env python3
"""Read audio metadata for gamdl-downloaded tracks.

The browser queue needs title/artist/album/duration for downloaded files, and
the macOS Spotlight index is unreliable for arbitrary local folders, so this
small bridge reads the tags directly with mutagen (already a gamdl dependency).
It degrades to filename-derived titles when tags are missing.

Usage:
    python gamdl-metadata.py <file> [<file> ...]

Prints one JSON array with an entry per input path. Exits 0 when mutagen is
available, 1 otherwise (the caller falls back to filename + afinfo).
"""

import argparse
import json
import sys


def first_tag(audio, key):
    try:
        value = audio.get(key)
        if not value:
            return ""
        if isinstance(value, (list, tuple)):
            return str(value[0]) if value else ""
        return str(value)
    except Exception:
        return ""


def read_metadata(file_path):
    item = {
        "path": file_path,
        "title": "",
        "artist": "",
        "album": "",
        "duration": 0,
    }
    try:
        from mutagen import File

        audio = File(file_path, easy=True)
        if audio is None:
            return item
        item["title"] = first_tag(audio, "title")
        item["artist"] = first_tag(audio, "artist")
        item["album"] = first_tag(audio, "album")
        length = getattr(getattr(audio, "info", None), "length", 0) or 0
        item["duration"] = round(length)
    except Exception:
        pass
    return item


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="+", help="Audio file paths")
    args = parser.parse_args()
    try:
        import mutagen  # noqa: F401
    except Exception as exc:
        print(json.dumps({"error": f"mutagen unavailable: {exc}"}))
        return 1
    print(json.dumps([read_metadata(p) for p in args.paths], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
