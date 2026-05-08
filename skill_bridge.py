#!/usr/bin/env python3
"""Read Hermes Skill detail content for Hermes Mobile."""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any


HERMES_HOME = Path(os.environ.get("HERMES_HOME") or os.environ.get("HERMES_WEB_HERMES_HOME") or (Path.home() / ".hermes"))
SKILL_ROOTS = [
    Path(os.environ["HERMES_WEB_SKILLS_ROOT"]) if os.environ.get("HERMES_WEB_SKILLS_ROOT") else None,
    HERMES_HOME / "skills",
]
SKILL_ROOTS = [root for root in SKILL_ROOTS if root]
MAX_SKILL_CHARS = 60000


def read_request() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    return json.loads(raw)


def json_response(payload: dict[str, Any], status: int = 0) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    sys.stdout.write("\n")
    raise SystemExit(status)


def normalize_skill_path(value: Any) -> str:
    text = str(value or "").strip().strip("`'\"").replace("\\", "/")
    marker = ".hermes/skills/"
    lower = text.lower()
    index = lower.find(marker)
    if index >= 0:
        text = text[index + len(marker):]
    text = re.sub(r"[\s，。；;、)\]]+$", "", text).strip("/")
    if text.lower().endswith("/skill.md"):
        text = text[:-len("/SKILL.md")]
    text = text.strip("/")
    if not text or text.lower() in {"skill.md", "skills"}:
        json_response({"ok": False, "error": "Skill path is required"}, 2)
    parts = [part for part in text.split("/") if part]
    if any(part in {".", ".."} for part in parts):
        json_response({"ok": False, "error": "Invalid skill path"}, 2)
    return "/".join(parts)


def resolve_skill_file(skill_path: str) -> Path | None:
    for root in SKILL_ROOTS:
        candidate = (root / skill_path / "SKILL.md").resolve()
        try:
            candidate.relative_to(root.resolve())
        except ValueError:
            continue
        if candidate.is_file():
            return candidate
    return None


def main() -> None:
    request = read_request()
    skill_path = normalize_skill_path(request.get("skill") or request.get("path"))
    file_path = resolve_skill_file(skill_path)
    if not file_path:
        json_response({"ok": False, "error": "Skill was not found", "skill": skill_path}, 2)
    text = file_path.read_text(encoding="utf-8", errors="replace")
    total_chars = len(text)
    truncated = total_chars > MAX_SKILL_CHARS
    if truncated:
        text = text[:MAX_SKILL_CHARS].rstrip()
    parts = skill_path.split("/")
    json_response({
        "ok": True,
        "skill": {
            "id": parts[-1],
            "label": parts[-1],
            "namespace": "/".join(parts[:-1]),
            "path": skill_path,
            "content": text,
            "totalChars": total_chars,
            "truncated": truncated,
        },
    })


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        json_response({"ok": False, "error": str(exc)}, 2)
