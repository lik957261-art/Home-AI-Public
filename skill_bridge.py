#!/usr/bin/env python3
"""Read Hermes Skill detail content for Hermes Mobile."""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Iterable


HERMES_HOME = Path(os.environ.get("HERMES_HOME") or os.environ.get("HERMES_WEB_HERMES_HOME") or (Path.home() / ".hermes"))
SKILL_ROOTS = [
    Path(os.environ["HERMES_WEB_SKILLS_ROOT"]) if os.environ.get("HERMES_WEB_SKILLS_ROOT") else None,
    HERMES_HOME / "skills",
]
SKILL_ROOTS = [root for root in SKILL_ROOTS if root]
MAX_SKILL_CHARS = 60000
SKILL_SEARCH_EXCLUDED_DIRS = {
    ".archive",
    ".git",
    ".hub",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    "__pycache__",
    "node_modules",
}


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


def relative_skill_path(root: Path, file_path: Path) -> str:
    root_resolved = root.resolve()
    skill_dir = file_path.parent.resolve()
    return skill_dir.relative_to(root_resolved).as_posix()


def is_excluded_search_dir(name: str) -> bool:
    normalized = str(name or "").strip()
    if normalized in SKILL_SEARCH_EXCLUDED_DIRS:
        return True
    return normalized.endswith(".egg-info") or normalized.endswith(".dist-info")


def direct_skill_candidate(root: Path, skill_path: str) -> tuple[str, Path] | None:
    candidate = (root / skill_path / "SKILL.md").resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError:
        return None
    if not candidate.is_file():
        return None
    return relative_skill_path(root, candidate), candidate


def shallow_named_skill_candidates(root: Path, skill_path: str) -> Iterable[tuple[str, Path]]:
    direct = direct_skill_candidate(root, skill_path)
    if direct:
        yield direct
    try:
        children = list(root.iterdir())
    except OSError:
        return
    for child in children:
        if not child.is_dir() or is_excluded_search_dir(child.name):
            continue
        candidate = direct_skill_candidate(child, skill_path)
        if not candidate:
            continue
        resolved_path = f"{child.name}/{candidate[0]}"
        yield resolved_path, candidate[1]


def walked_named_skill_candidates(root: Path, skill_path: str) -> Iterable[tuple[str, Path]]:
    root_resolved = root.resolve()
    for current, dirnames, filenames in os.walk(root_resolved):
        dirnames[:] = [name for name in dirnames if not is_excluded_search_dir(name)]
        if "SKILL.md" not in filenames:
            continue
        current_path = Path(current)
        if current_path.name != skill_path:
            continue
        candidate = current_path / "SKILL.md"
        try:
            resolved_path = relative_skill_path(root_resolved, candidate)
        except ValueError:
            continue
        yield resolved_path, candidate.resolve()


def dedupe_skill_matches(matches: Iterable[tuple[str, Path]]) -> dict[str, Path]:
    deduped: dict[str, Path] = {}
    for resolved_path, candidate in sorted(matches, key=lambda item: item[0]):
        deduped.setdefault(resolved_path, candidate)
    return deduped


def resolve_unique_skill_match(skill_path: str, matches: dict[str, Path]) -> tuple[Path, str] | None:
    if len(matches) == 1:
        resolved_path, candidate = next(iter(matches.items()))
        return candidate, resolved_path
    if len(matches) > 1:
        json_response({
            "ok": False,
            "status": 409,
            "error": "Skill path is ambiguous",
            "skill": skill_path,
            "matches": list(matches.keys())[:20],
        }, 2)
    return None


def resolve_skill_file(skill_path: str) -> tuple[Path, str] | None:
    for root in SKILL_ROOTS:
        direct = direct_skill_candidate(root, skill_path)
        if direct:
            resolved_path, candidate = direct
            return candidate, resolved_path
    if "/" in skill_path:
        return None
    shallow_matches: list[tuple[str, Path]] = []
    for root in SKILL_ROOTS:
        root_resolved = root.resolve()
        if not root_resolved.is_dir():
            continue
        shallow_matches.extend(shallow_named_skill_candidates(root_resolved, skill_path))
    shallow = resolve_unique_skill_match(skill_path, dedupe_skill_matches(shallow_matches))
    if shallow:
        return shallow
    walked_matches: list[tuple[str, Path]] = []
    for root in SKILL_ROOTS:
        root_resolved = root.resolve()
        if not root_resolved.is_dir():
            continue
        walked_matches.extend(walked_named_skill_candidates(root_resolved, skill_path))
    return resolve_unique_skill_match(skill_path, dedupe_skill_matches(walked_matches))


def main() -> None:
    request = read_request()
    skill_path = normalize_skill_path(request.get("skill") or request.get("path"))
    resolved = resolve_skill_file(skill_path)
    if not resolved:
        json_response({"ok": False, "error": "Skill was not found", "skill": skill_path}, 2)
    file_path, resolved_skill_path = resolved
    text = file_path.read_text(encoding="utf-8", errors="replace")
    total_chars = len(text)
    truncated = total_chars > MAX_SKILL_CHARS
    if truncated:
        text = text[:MAX_SKILL_CHARS].rstrip()
    parts = resolved_skill_path.split("/")
    json_response({
        "ok": True,
        "skill": {
            "id": parts[-1],
            "label": parts[-1],
            "namespace": "/".join(parts[:-1]),
            "path": resolved_skill_path,
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
