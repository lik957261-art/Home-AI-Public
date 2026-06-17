#!/usr/bin/env python3
"""Restricted directory operations for WSL-only Hermes Mobile workspaces."""

from __future__ import annotations

import base64
import json
import mimetypes
import os
import posixpath
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


MAX_LIST_ENTRIES = 300


def load_mount_helpers() -> dict[str, str]:
    raw = os.environ.get("HERMES_WEB_VOLUME1_MOUNT_HELPERS_JSON", "").strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(data, dict):
        return {}
    helpers: dict[str, str] = {}
    for root, script in data.items():
        root_text = str(root or "").rstrip("/")
        script_text = str(script or "").strip()
        if root_text and script_text:
            helpers[root_text] = script_text
    return helpers


MOUNT_HELPERS = load_mount_helpers()


def read_request() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    return json.loads(raw)


def json_response(payload: dict[str, Any], status: int = 0) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    sys.stdout.write("\n")
    raise SystemExit(status)


def clean_path(value: Any) -> Path:
    text = str(value or "").strip()
    if not text.startswith("/"):
        json_response({"ok": False, "error": "Path must be absolute"}, 2)
    return Path(text)


def ensure_volume1_mount(path: Path) -> None:
    text = str(path)
    for root, helper in MOUNT_HELPERS.items():
        if text == root or text.startswith(f"{root}/"):
            script = Path(helper)
            if script.exists():
                subprocess.run(
                    [str(script)],
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=10,
                    check=False,
                )
            return


def iso_mtime(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def entry_payload(path: Path) -> dict[str, Any]:
    stat = path.stat()
    is_dir = path.is_dir()
    mime = "" if is_dir else (mimetypes.guess_type(path.name)[0] or "application/octet-stream")
    return {
        "name": path.name,
        "path": str(path),
        "type": "directory" if is_dir else "file",
        "size": 0 if is_dir else stat.st_size,
        "mtime": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat().replace("+00:00", "Z"),
        "mime": mime,
    }


def entry_mtime_timestamp(entry: dict[str, Any]) -> float:
    try:
        return datetime.fromisoformat(str(entry.get("mtime") or "1970-01-01T00:00:00Z").replace("Z", "+00:00")).timestamp()
    except (TypeError, ValueError, OverflowError):
        return 0.0


def list_entries(path: Path, directories_only: bool = False) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    with os.scandir(path) as scan:
        for item in scan:
            if item.name.startswith(".") or item.name.startswith("@") or item.name.startswith("#"):
                continue
            try:
                item_path = Path(item.path)
                if directories_only and not item.is_dir(follow_symlinks=False):
                    continue
                items.append(entry_payload(item_path))
            except OSError:
                continue
    items.sort(
        key=lambda entry: (
            entry["type"] != "directory",
            -entry_mtime_timestamp(entry),
            str(entry["name"]).casefold(),
        )
    )
    return items[:MAX_LIST_ENTRIES]


def assert_child_name(name: Any) -> str:
    text = str(name or "").strip()
    if not text or text in {".", ".."}:
        json_response({"ok": False, "error": "Invalid name"}, 2)
    if "/" in text or "\\" in text or "\x00" in text:
        json_response({"ok": False, "error": "Invalid name"}, 2)
    return text


def assert_child_path(parent: Path, child: Path) -> None:
    parent_text = str(parent.resolve())
    child_text = str(child.resolve() if child.exists() else child)
    common = posixpath.commonpath([parent_text, child_text])
    if common != parent_text:
        json_response({"ok": False, "error": "Target escapes parent directory"}, 2)


def unique_child_path(parent: Path, filename: str) -> Path:
    stem = Path(filename).stem or "upload"
    suffix = Path(filename).suffix
    candidate = parent / filename
    if not candidate.exists():
        return candidate
    for index in range(1, 1000):
        candidate = parent / f"{stem} ({index}){suffix}"
        if not candidate.exists():
            return candidate
    json_response({"ok": False, "error": "Could not find an available file name"}, 2)


def handle(request: dict[str, Any]) -> None:
    action = str(request.get("action") or "").strip()
    path = clean_path(request.get("path"))
    ensure_volume1_mount(path)

    if action == "stat":
        if not path.exists():
            json_response({"ok": False, "exists": False, "error": "Path not found"}, 1)
        json_response({"ok": True, "exists": True, "entry": entry_payload(path)})

    if action == "tree":
        if not path.is_dir():
            json_response({"ok": False, "error": "Path is not a directory"}, 1)
        dirs = []
        for entry in list_entries(path, directories_only=True):
            child_path = Path(entry["path"])
            entry["children"] = list_entries(child_path, directories_only=True)
            dirs.append(entry)
        json_response({"ok": True, "path": str(path), "entries": dirs})

    if action == "preview":
        if not path.is_dir():
            json_response({"ok": False, "error": "Path is not a directory"}, 1)
        json_response({
            "ok": True,
            "path": str(path),
            "updatedAt": iso_mtime(path),
            "entries": list_entries(path),
        })

    if action == "mkdir":
        if not path.is_dir():
            json_response({"ok": False, "error": "Path is not a directory"}, 1)
        name = assert_child_name(request.get("name"))
        target = path / name
        assert_child_path(path, target)
        if target.exists():
            json_response({"ok": False, "error": "Directory already exists"}, 3)
        target.mkdir()
        json_response({"ok": True, "entry": entry_payload(target)})

    if action == "upload":
        if not path.is_dir():
            json_response({"ok": False, "error": "Path is not a directory"}, 1)
        filename = assert_child_name(request.get("filename") or "upload.bin")
        data = base64.b64decode(str(request.get("dataBase64") or ""), validate=True)
        if not data:
            json_response({"ok": False, "error": "Missing upload data"}, 2)
        target = unique_child_path(path, filename)
        assert_child_path(path, target)
        with target.open("xb") as handle:
            handle.write(data)
        json_response({"ok": True, "entry": entry_payload(target)})

    if action == "delete":
        if not path.exists():
            json_response({"ok": False, "error": "Path not found"}, 1)
        entry = entry_payload(path)
        if path.is_dir() and not path.is_symlink():
            if bool(request.get("recursive")):
                shutil.rmtree(path)
            else:
                path.rmdir()
        else:
            path.unlink()
        json_response({"ok": True, "entry": entry})

    if action == "rename":
        if not path.exists():
            json_response({"ok": False, "error": "Path not found"}, 1)
        name = assert_child_name(request.get("name"))
        parent = path.parent
        target = parent / name
        assert_child_path(parent, target)
        if target.exists():
            json_response({"ok": False, "error": "Target already exists"}, 3)
        path.rename(target)
        json_response({"ok": True, "entry": entry_payload(target)})

    json_response({"ok": False, "error": "Unknown action"}, 2)


def main() -> None:
    try:
        handle(read_request())
    except SystemExit:
        raise
    except Exception as exc:
        json_response({"ok": False, "error": str(exc)}, 1)


if __name__ == "__main__":
    main()
