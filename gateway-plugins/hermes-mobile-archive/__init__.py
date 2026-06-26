"""Scoped ZIP listing and safe extraction for Hermes Mobile Gateway profiles."""

from __future__ import annotations

import json
import os
import re
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any


DEFAULT_ALLOWED_ROOTS = (
    "/mnt/c/ProgramData/HermesMobile/data/drive",
    "/mnt/c/ProgramData/HermesMobile/data/uploads",
    "/mnt/c/ProgramData/HermesMobile/data/artifacts",
)
SUPPORTED_SUFFIXES = {".zip"}
SUPPORTED_COMPRESSION = {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED}
MAX_ARCHIVE_BYTES = 200 * 1024 * 1024
MAX_ENTRY_BYTES = 80 * 1024 * 1024
MAX_TOTAL_EXTRACT_BYTES = 300 * 1024 * 1024
MAX_ENTRIES = 2000
MAX_RETURN_ENTRIES = 500


ARCHIVE_LIST_SCHEMA = {
    "name": "archive_list",
    "description": (
        "List entries in an in-scope ZIP archive without extracting it. Use this when read_file "
        "cannot inspect a .zip package directly. The archive path must stay inside current "
        "Hermes Mobile workspace/upload/artifact roots."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "file_path": {
                "type": "string",
                "description": "Absolute path to a .zip file inside an allowed Hermes Mobile root.",
            },
            "max_entries": {
                "type": "integer",
                "description": "Maximum entry summaries to return, from 1 to 500. Defaults to 200.",
                "minimum": 1,
                "maximum": MAX_RETURN_ENTRIES,
                "default": 200,
            },
        },
        "required": ["file_path"],
    },
}


ARCHIVE_EXTRACT_SAFE_SCHEMA = {
    "name": "archive_extract_safe",
    "description": (
        "Safely extract an in-scope ZIP archive into an allowed Hermes Mobile root. The extractor "
        "rejects path traversal, absolute paths, symlinks, encrypted entries, unsupported "
        "compression methods, and oversized archives. It does not overwrite existing files."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "file_path": {
                "type": "string",
                "description": "Absolute path to a .zip file inside an allowed Hermes Mobile root.",
            },
            "destination_dir": {
                "type": "string",
                "description": (
                    "Optional absolute extraction directory inside an allowed Hermes Mobile root. "
                    "Defaults to a sibling '<archive-name>_extracted' directory."
                ),
            },
            "max_entries": {
                "type": "integer",
                "description": "Maximum files/directories accepted in the archive, from 1 to 2000. Defaults to 2000.",
                "minimum": 1,
                "maximum": MAX_ENTRIES,
                "default": MAX_ENTRIES,
            },
            "max_total_bytes": {
                "type": "integer",
                "description": "Maximum total uncompressed bytes, from 1MB to 300MB. Defaults to 300MB.",
                "minimum": 1048576,
                "maximum": MAX_TOTAL_EXTRACT_BYTES,
                "default": MAX_TOTAL_EXTRACT_BYTES,
            },
        },
        "required": ["file_path"],
    },
}


def _json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False)


def _split_env_list(name: str, defaults: tuple[str, ...]) -> list[str]:
    raw = os.environ.get(name, "")
    if not raw.strip():
        return list(defaults)
    return [item.strip() for item in re.split(r"[;,\n]+", raw) if item.strip()]


def _platform_path(value: str) -> str:
    text = str(value or "").strip().strip('"').strip("'")
    if os.name == "nt":
        wsl_match = re.match(r"^/mnt/([A-Za-z])/(.*)$", text)
        if wsl_match:
            drive = wsl_match.group(1).upper()
            rest = wsl_match.group(2).replace("/", "\\")
            return f"{drive}:\\{rest}"
        return text
    match = re.match(r"^([A-Za-z]):[\\/](.*)$", text)
    if match:
        drive = match.group(1).lower()
        rest = match.group(2).replace("\\", "/")
        return f"/mnt/{drive}/{rest}"
    return text


def _allowed_roots() -> list[Path]:
    roots: list[Path] = []
    for item in _split_env_list("HERMES_MOBILE_ARCHIVE_ALLOWED_ROOTS", DEFAULT_ALLOWED_ROOTS):
        try:
            roots.append(Path(_platform_path(item)).resolve())
        except Exception:
            continue
    return roots


def _inside_roots(path: Path, roots: list[Path]) -> bool:
    try:
        resolved = path.resolve(strict=False)
    except Exception:
        return False
    for root in roots:
        try:
            resolved.relative_to(root)
            return True
        except ValueError:
            continue
    return False


def _bounded_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        number = int(value)
    except Exception:
        number = default
    return max(minimum, min(maximum, number))


def _max_archive_bytes() -> int:
    return _bounded_int(
        os.environ.get("HERMES_MOBILE_ARCHIVE_MAX_BYTES"),
        MAX_ARCHIVE_BYTES,
        1024 * 1024,
        1024 * 1024 * 1024,
    )


def _validate_archive_path(value: Any) -> Path:
    text = str(value or "").strip()
    if not text:
        raise ValueError("file_path_required")
    path = Path(_platform_path(text)).expanduser()
    if not path.is_absolute():
        raise PermissionError("file_path_must_be_absolute")
    if not _inside_roots(path, _allowed_roots()):
        raise PermissionError("file_path_outside_allowed_roots")
    if path.suffix.lower() not in SUPPORTED_SUFFIXES:
        raise ValueError("unsupported_archive_suffix")
    if not path.exists():
        raise FileNotFoundError("file_path_not_found")
    if not path.is_file():
        raise ValueError("file_path_not_file")
    size = path.stat().st_size
    if size > _max_archive_bytes():
        raise ValueError("archive_file_too_large")
    return path.resolve()


def _default_destination(path: Path) -> Path:
    name = path.stem.strip() or "archive"
    return path.parent / f"{name}_extracted"


def _validate_destination(value: Any, archive_path: Path) -> Path:
    text = str(value or "").strip()
    path = Path(_platform_path(text)).expanduser() if text else _default_destination(archive_path)
    if not path.is_absolute():
        raise PermissionError("destination_dir_must_be_absolute")
    if not _inside_roots(path, _allowed_roots()):
        raise PermissionError("destination_dir_outside_allowed_roots")
    return path.resolve(strict=False)


def _entry_kind(info: zipfile.ZipInfo) -> str:
    if info.is_dir():
        return "directory"
    mode = (info.external_attr >> 16) & 0o170000
    if mode == 0o120000:
        return "symlink"
    return "file"


def _safe_relative_name(name: str) -> str:
    raw = str(name or "").replace("\\", "/").strip()
    if not raw:
        raise ValueError("archive_entry_name_empty")
    if "\x00" in raw:
        raise ValueError("archive_entry_name_null_byte")
    if raw.startswith("/") or raw.startswith("//") or raw.startswith("~"):
        raise ValueError("archive_entry_absolute_path")
    if re.match(r"^[A-Za-z]:", raw):
        raise ValueError("archive_entry_drive_path")
    parts = []
    for part in PurePosixPath(raw).parts:
        if part in {"", "."}:
            continue
        if part == "..":
            raise ValueError("archive_entry_path_traversal")
        parts.append(part)
    if not parts:
        raise ValueError("archive_entry_name_empty")
    return PurePosixPath(*parts).as_posix()


def _entry_summary(info: zipfile.ZipInfo) -> dict[str, Any]:
    rel = _safe_relative_name(info.filename)
    kind = _entry_kind(info)
    if info.flag_bits & 0x1:
        raise ValueError(f"archive_entry_encrypted:{rel}")
    if kind == "symlink":
        raise ValueError(f"archive_entry_symlink_unsupported:{rel}")
    if info.compress_type not in SUPPORTED_COMPRESSION:
        raise ValueError(f"archive_entry_compression_unsupported:{rel}")
    if info.file_size > MAX_ENTRY_BYTES:
        raise ValueError(f"archive_entry_too_large:{rel}")
    return {
        "path": rel,
        "_zipName": info.filename,
        "kind": kind,
        "bytes": int(info.file_size),
        "compressedBytes": int(info.compress_size),
        "compression": int(info.compress_type),
    }


def _validated_entries(archive: zipfile.ZipFile, max_entries: int) -> list[dict[str, Any]]:
    infos = archive.infolist()
    if len(infos) > max_entries:
        raise ValueError("archive_entry_count_exceeded")
    entries = [_entry_summary(info) for info in infos]
    seen = set()
    for entry in entries:
        key = entry["path"].rstrip("/")
        if key in seen:
            raise ValueError(f"archive_entry_duplicate:{entry['path']}")
        seen.add(key)
    return entries


def _archive_list(path: Path, max_return_entries: int) -> dict[str, Any]:
    try:
        with zipfile.ZipFile(path) as archive:
            entries = _validated_entries(archive, MAX_ENTRIES)
    except zipfile.BadZipFile:
        raise ValueError("invalid_zip_archive") from None
    total_bytes = sum(item["bytes"] for item in entries if item["kind"] == "file")
    truncated = len(entries) > max_return_entries
    public_entries = [{key: value for key, value in item.items() if not key.startswith("_")} for item in entries]
    return {
        "format": "zip",
        "fileName": path.name,
        "entryCount": len(entries),
        "fileCount": len([item for item in entries if item["kind"] == "file"]),
        "directoryCount": len([item for item in entries if item["kind"] == "directory"]),
        "totalUncompressedBytes": total_bytes,
        "truncated": truncated,
        "entries": public_entries[:max_return_entries],
    }


def _target_path(destination: Path, relative: str) -> Path:
    target = (destination / relative).resolve(strict=False)
    try:
        target.relative_to(destination)
    except ValueError:
        raise ValueError("archive_entry_target_outside_destination") from None
    return target


def _archive_extract(path: Path, destination: Path, max_entries: int, max_total_bytes: int) -> dict[str, Any]:
    try:
        with zipfile.ZipFile(path) as archive:
            entries = _validated_entries(archive, max_entries)
            total_bytes = sum(item["bytes"] for item in entries if item["kind"] == "file")
            if total_bytes > max_total_bytes:
                raise ValueError("archive_total_uncompressed_bytes_exceeded")
            targets = []
            for entry in entries:
                target = _target_path(destination, entry["path"])
                if entry["kind"] == "directory":
                    if target.exists() and not target.is_dir():
                        raise FileExistsError(f"archive_target_exists:{entry['path']}")
                elif target.exists():
                    raise FileExistsError(f"archive_target_exists:{entry['path']}")
                targets.append((entry, target))
            destination.mkdir(parents=True, exist_ok=True)
            extracted: list[dict[str, Any]] = []
            for entry, target in targets:
                if entry["kind"] == "directory":
                    target.mkdir(parents=True, exist_ok=True)
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(entry["_zipName"], "r") as source:
                    with open(target, "xb") as dest:
                        while True:
                            chunk = source.read(1024 * 1024)
                            if not chunk:
                                break
                            dest.write(chunk)
                extracted.append({
                    "path": entry["path"],
                    "bytes": entry["bytes"],
                })
    except zipfile.BadZipFile:
        raise ValueError("invalid_zip_archive") from None
    return {
        "format": "zip",
        "fileName": path.name,
        "destinationDir": str(destination),
        "destinationName": destination.name,
        "entryCount": len(entries),
        "extractedCount": len(extracted),
        "totalUncompressedBytes": total_bytes,
        "files": extracted[:MAX_RETURN_ENTRIES],
        "truncated": len(extracted) > MAX_RETURN_ENTRIES,
    }


def _archive_list_handler(args: dict[str, Any], **_: Any) -> str:
    try:
        path = _validate_archive_path(args.get("file_path"))
        max_entries = _bounded_int(args.get("max_entries"), 200, 1, MAX_RETURN_ENTRIES)
        return _json({
            "ok": True,
            "tool": "archive_list",
            **_archive_list(path, max_entries),
        })
    except Exception as error:
        return _json({
            "ok": False,
            "tool": "archive_list",
            "error": str(error),
        })


def _archive_extract_safe_handler(args: dict[str, Any], **_: Any) -> str:
    try:
        path = _validate_archive_path(args.get("file_path"))
        destination = _validate_destination(args.get("destination_dir"), path)
        max_entries = _bounded_int(args.get("max_entries"), MAX_ENTRIES, 1, MAX_ENTRIES)
        max_total_bytes = _bounded_int(
            args.get("max_total_bytes"),
            MAX_TOTAL_EXTRACT_BYTES,
            1024 * 1024,
            MAX_TOTAL_EXTRACT_BYTES,
        )
        return _json({
            "ok": True,
            "tool": "archive_extract_safe",
            **_archive_extract(path, destination, max_entries, max_total_bytes),
        })
    except Exception as error:
        return _json({
            "ok": False,
            "tool": "archive_extract_safe",
            "error": str(error),
        })


def register(ctx) -> None:
    ctx.register_tool(
        name="archive_list",
        toolset="file",
        schema=ARCHIVE_LIST_SCHEMA,
        handler=_archive_list_handler,
        description="Scoped ZIP archive listing for Hermes Mobile workspace files.",
        emoji="zip",
    )
    ctx.register_tool(
        name="archive_extract_safe",
        toolset="file",
        schema=ARCHIVE_EXTRACT_SAFE_SCHEMA,
        handler=_archive_extract_safe_handler,
        description="Scoped safe ZIP extraction for Hermes Mobile workspace files.",
        emoji="zip",
    )
