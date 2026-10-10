#!/usr/bin/env python3
"""Promo catalog: offline reader for awesome-opus-5.5-video cases.json.

Queries a local snapshot of the awesome-opus-5.5-video "cases.json" catalog
without any network access. Attribution for the upstream dataset belongs to
the awesome-opus-5.5-video project; this tool only reads a local copy and never
downloads, fetches, or executes any referenced content.

Usage:
    python3 tooling/promo-catalog.py CASES.json [--category CAT]
        [--kind full|brief|missing] [--query TEXT] [--limit N] [--stats]

Standard library only. Emits UTF-8 JSON on stdout; diagnostics go to stderr
with a nonzero exit code and no traceback.

Expected schema (defensive; only existing keys are surfaced):

    {
      "cases": [
        {
          "id": "string",
          "title": {"zh": "...", "en": "..."},
          "category": "string",
          "creator": {"handle": "..."},
          "duration_seconds": 12.5,
          "original_post_url": "https://...",
          "prompt": null | {
            "kind": "full" | "brief",
            "source_url": "...",
            "page_url": "...",
            "length": 123,
            "source": "..."
          },
          "tools_reported": ["..."]
        }
      ]
    }
"""

import argparse
import json
import sys

PROMPT_KINDS = ("full", "brief")

# Output record projection order (keys only added when present in source).
RECORD_FIELDS = (
    "id",
    "title",
    "category",
    "creator",
    "duration_seconds",
    "original_post_url",
    "prompt",
    "tools_reported",
)


def fail(message):
    """Print a friendly error to stderr and exit nonzero."""
    sys.stderr.write("promo-catalog: error: {0}\n".format(message))
    raise SystemExit(2)


def load_catalog(path):
    """Read and parse the JSON catalog, validating the root structure."""
    try:
        with open(path, "rb") as handle:
            raw = handle.read()
    except FileNotFoundError:
        fail("input file not found: {0}".format(path))
    except IsADirectoryError:
        fail("input path is a directory, not a file: {0}".format(path))
    except PermissionError:
        fail("permission denied reading: {0}".format(path))
    except OSError as exc:
        fail("could not read {0}: {1}".format(path, exc))

    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        fail("input is not valid UTF-8: {0}".format(path))

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        fail("invalid JSON in {0}: {1}".format(path, exc))

    if not isinstance(data, dict):
        fail("root of {0} must be a JSON object".format(path))

    cases = data.get("cases")
    if cases is None:
        fail("root object of {0} is missing the 'cases' key".format(path))
    if not isinstance(cases, list):
        fail("'cases' must be a JSON array in {0}".format(path))

    for index, record in enumerate(cases):
        if not isinstance(record, dict):
            fail(
                "cases[{0}] must be a JSON object, got {1}".format(
                    index, type(record).__name__
                )
            )

    return cases


def title_text(title):
    """Flatten a {zh,en} title mapping into a searchable string."""
    if not isinstance(title, dict):
        return ""
    parts = []
    for key in ("zh", "en"):
        value = title.get(key)
        if isinstance(value, str):
            parts.append(value)
    return "\n".join(parts)


def prompt_kind(record):
    """Return 'full', 'brief', or None when no usable prompt is present."""
    prompt = record.get("prompt")
    if not isinstance(prompt, dict):
        return None
    kind = prompt.get("kind")
    if isinstance(kind, str) and kind in PROMPT_KINDS:
        return kind
    return None


def matches(record, args):
    if args.category is not None:
        category = record.get("category")
        if not isinstance(category, str) or category != args.category:
            return False

    if args.kind is not None:
        kind = prompt_kind(record)
        if args.kind == "missing":
            if kind is not None:
                return False
        elif kind != args.kind:
            return False

    if args.query:
        needle = args.query.casefold()
        haystack = title_text(record.get("title")).casefold()
        if needle not in haystack:
            return False

    return True


def project(record):
    """Return a metadata-only projection, omitting absent keys."""
    result = {}
    for field in RECORD_FIELDS:
        if field in record:
            result[field] = record[field]
    return result


def emit(payload):
    """Write a UTF-8 JSON document to stdout."""
    text = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=False)
    out = getattr(sys.stdout, "buffer", None)
    if out is not None:
        out.write(text.encode("utf-8"))
        out.write(b"\n")
    else:  # pragma: no cover - fallback for exotic stdouts
        sys.stdout.write(text + "\n")


def build_stats(cases):
    """Aggregate counts by category and by prompt kind, plus a total."""
    by_category = {}
    by_kind = {"full": 0, "brief": 0, "missing": 0}

    for record in cases:
        category = record.get("category")
        if isinstance(category, str) and category:
            by_category[category] = by_category.get(category, 0) + 1
        else:
            by_category["(uncategorized)"] = by_category.get("(uncategorized)", 0) + 1

        kind = prompt_kind(record)
        by_kind[kind if kind is not None else "missing"] += 1

    return {
        "total": len(cases),
        "by_category": by_category,
        "by_prompt_kind": by_kind,
    }


def parse_limit(value):
    try:
        limit = int(value)
    except (TypeError, ValueError):
        fail("--limit must be a positive integer, got {0!r}".format(value))
    if limit <= 0:
        fail("--limit must be a positive integer, got {0}".format(limit))
    return limit


def build_parser():
    parser = argparse.ArgumentParser(
        prog="promo-catalog.py",
        description=(
            "Query a local awesome-opus-5.5-video cases.json catalog offline. "
            "Upstream attribution: awesome-opus-5.5-video."
        ),
    )
    parser.add_argument("path", help="path to a local cases.json catalog")
    parser.add_argument(
        "--category",
        default=None,
        help="exact category match",
    )
    parser.add_argument(
        "--kind",
        choices=("full", "brief", "missing"),
        default=None,
        help="filter by prompt kind ('missing' = no usable prompt)",
    )
    parser.add_argument(
        "--query",
        default=None,
        help="case-insensitive substring match against zh/en titles",
    )
    parser.add_argument(
        "--limit",
        type=parse_limit,
        default=10,
        help="maximum records to emit (positive integer, default 10)",
    )
    parser.add_argument(
        "--stats",
        action="store_true",
        help="print aggregate counts instead of records",
    )
    return parser


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)

    cases = load_catalog(args.path)

    if args.stats:
        emit(build_stats(cases))
        return 0

    matched = [record for record in cases if matches(record, args)]
    limited = matched[: args.limit]
    emit([project(record) for record in limited])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
