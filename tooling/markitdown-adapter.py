#!/usr/bin/env python3
"""Small JSON bridge for optional MarkItDown imports."""

import argparse
import inspect
import json
import os
import sys
import traceback


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert one local file with MarkItDown.")
    parser.add_argument("path")
    parser.add_argument("--name", default="")
    parser.add_argument("--mime", default="")
    args = parser.parse_args()

    try:
        from markitdown import MarkItDown
        try:
            from markitdown import StreamInfo
        except ImportError:
            StreamInfo = None

        extension = os.path.splitext(args.name or args.path)[1].lower() or None
        init_kwargs = {}
        if "enable_plugins" in inspect.signature(MarkItDown).parameters:
            init_kwargs["enable_plugins"] = False

        convert_kwargs = {}
        if StreamInfo is not None:
            stream_info = StreamInfo(
                extension=extension,
                mimetype=args.mime or None,
                filename=args.name or os.path.basename(args.path),
            )
            convert_kwargs["stream_info"] = stream_info
        if "keep_data_uris" in inspect.signature(MarkItDown().convert).parameters:
            convert_kwargs["keep_data_uris"] = False

        result = MarkItDown(**init_kwargs).convert(args.path, **convert_kwargs)
        text = getattr(result, "markdown", None)
        if text is None:
            text = getattr(result, "text_content", "")
        print(json.dumps({
            "ok": True,
            "text": text or "",
            "title": getattr(result, "title", None),
            "engine": "markitdown",
        }, ensure_ascii=False))
        return 0
    except Exception as error:
        print(json.dumps({
            "ok": False,
            "error": str(error),
            "errorType": type(error).__name__,
            "trace": traceback.format_exc(limit=4),
        }, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
