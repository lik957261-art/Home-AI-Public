#!/usr/bin/env python3
"""Render a small wardrobe phone summary from sanitized JSON.

This helper intentionally accepts only ordinary JSON fields such as title,
sections, and item labels. It is not allowed to read plugin secrets, local
databases, or image paths directly.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def clean_text(value: object, limit: int = 200) -> str:
    text = str(value or "").replace("\n", " ").strip()
    return text[:limit]


def render_markdown(payload: dict) -> str:
    title = clean_text(payload.get("title") or "Wardrobe Summary", 120)
    lines = [f"# {title}", ""]
    for section in payload.get("sections") or []:
        if not isinstance(section, dict):
            continue
        heading = clean_text(section.get("heading") or "Section", 120)
        lines.extend([f"## {heading}", ""])
        for item in section.get("items") or []:
            if isinstance(item, dict):
                label = clean_text(item.get("label") or item.get("name"), 160)
                note = clean_text(item.get("note"), 220)
                lines.append(f"- {label}{': ' + note if note else ''}")
            else:
                lines.append(f"- {clean_text(item, 180)}")
        lines.append("")
    return "\n".join(lines).strip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
    Path(args.output).write_text(render_markdown(payload), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
