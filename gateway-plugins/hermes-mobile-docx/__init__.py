"""Scoped DOCX text extraction for Hermes Mobile Gateway profiles."""

from __future__ import annotations

import io
import json
import os
import re
import zipfile
from pathlib import Path
from typing import Any
from xml.etree import ElementTree


DEFAULT_ALLOWED_ROOTS = (
    "/mnt/c/ProgramData/HermesMobile/data/drive",
    "/mnt/c/ProgramData/HermesMobile/data/uploads",
    "/mnt/c/ProgramData/HermesMobile/data/artifacts",
)
SUPPORTED_SUFFIXES = {".docx", ".docm", ".dotx", ".dotm"}
MAX_DOCX_BYTES = 80 * 1024 * 1024
MAX_XML_PART_BYTES = 40 * 1024 * 1024
MAX_RETURN_CHARS = 100_000
DEFAULT_RETURN_CHARS = 30_000


DOCX_EXTRACT_TEXT_SCHEMA = {
    "name": "docx_extract_text",
    "description": (
        "Extract readable text from an in-scope Microsoft Word DOCX/DOCM/DOTX/DOTM file by "
        "unpacking the Office Open XML package. Use this when read_file cannot decode a "
        "Word document directly. The file path must stay inside current Hermes Mobile "
        "workspace/upload/artifact roots."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "file_path": {
                "type": "string",
                "description": "Path to a .docx/.docm/.dotx/.dotm file inside an allowed Hermes Mobile root.",
            },
            "max_chars": {
                "type": "integer",
                "description": "Maximum extracted characters to return, from 1000 to 100000. Defaults to 30000.",
                "minimum": 1000,
                "maximum": MAX_RETURN_CHARS,
                "default": DEFAULT_RETURN_CHARS,
            },
            "include_headers_footers": {
                "type": "boolean",
                "description": "Include Word headers, footers, footnotes, and endnotes when present. Defaults to true.",
                "default": True,
            },
            "include_comments": {
                "type": "boolean",
                "description": "Include Word comments when present. Defaults to false.",
                "default": False,
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
    for item in _split_env_list("HERMES_MOBILE_DOCX_ALLOWED_ROOTS", DEFAULT_ALLOWED_ROOTS):
        try:
            roots.append(Path(_platform_path(item)).resolve())
        except Exception:
            continue
    return roots


def _inside_roots(path: Path, roots: list[Path]) -> bool:
    try:
        resolved = path.resolve()
    except Exception:
        return False
    for root in roots:
        try:
            resolved.relative_to(root)
            return True
        except ValueError:
            continue
    return False


def _max_docx_bytes() -> int:
    try:
        value = int(os.environ.get("HERMES_MOBILE_DOCX_MAX_BYTES", str(MAX_DOCX_BYTES)))
    except Exception:
        value = MAX_DOCX_BYTES
    return max(1024 * 1024, min(512 * 1024 * 1024, value))


def _max_chars(value: Any) -> int:
    try:
        number = int(value)
    except Exception:
        number = DEFAULT_RETURN_CHARS
    return max(1000, min(MAX_RETURN_CHARS, number))


def _bool(value: Any, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _validate_docx_path(value: Any) -> Path:
    text = str(value or "").strip()
    if not text:
        raise ValueError("file_path_required")
    path = Path(_platform_path(text)).expanduser()
    if not path.is_absolute():
        raise PermissionError("file_path_must_be_absolute")
    if not _inside_roots(path, _allowed_roots()):
        raise PermissionError("file_path_outside_allowed_roots")
    if path.suffix.lower() not in SUPPORTED_SUFFIXES:
        raise ValueError("unsupported_word_file_suffix")
    if not path.exists():
        raise FileNotFoundError("file_path_not_found")
    if not path.is_file():
        raise ValueError("file_path_not_file")
    size = path.stat().st_size
    if size > _max_docx_bytes():
        raise ValueError("docx_file_too_large")
    return path.resolve()


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def _compact_line(value: str) -> str:
    text = value.replace("\u00a0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    return text.strip()


def _extract_xml_text(data: bytes) -> str:
    lines: list[str] = []
    current: list[str] = []
    try:
        for event, elem in ElementTree.iterparse(io.BytesIO(data), events=("end",)):
            local = _local_name(elem.tag)
            if local == "t" and elem.text:
                current.append(elem.text)
            elif local == "tab":
                current.append("\t")
            elif local in {"br", "cr"}:
                current.append("\n")
            elif local == "tc":
                current.append("\t")
            elif local in {"p", "tr"}:
                line = _compact_line("".join(current))
                if line:
                    lines.append(line)
                current = []
            elem.clear()
    except ElementTree.ParseError as exc:
        raise ValueError(f"invalid_docx_xml: {exc}") from None

    tail = _compact_line("".join(current))
    if tail:
        lines.append(tail)
    text = "\n".join(lines)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _word_part_names(archive: zipfile.ZipFile, include_headers_footers: bool, include_comments: bool) -> list[str]:
    names = set(archive.namelist())
    selected: list[str] = []
    if "word/document.xml" in names:
        selected.append("word/document.xml")
    if include_headers_footers:
        optional = []
        for name in names:
            if re.match(r"^word/(header|footer)\d+\.xml$", name):
                optional.append(name)
            elif name in {"word/footnotes.xml", "word/endnotes.xml"}:
                optional.append(name)
        selected.extend(sorted(optional))
    if include_comments and "word/comments.xml" in names:
        selected.append("word/comments.xml")
    return selected


def _read_part(archive: zipfile.ZipFile, name: str) -> bytes:
    info = archive.getinfo(name)
    if info.file_size > MAX_XML_PART_BYTES:
        raise ValueError(f"docx_xml_part_too_large: {name}")
    return archive.read(name)


def _extract_docx(path: Path, max_chars: int, include_headers_footers: bool, include_comments: bool) -> dict[str, Any]:
    try:
        with zipfile.ZipFile(path) as archive:
            names = _word_part_names(archive, include_headers_footers, include_comments)
            if "word/document.xml" not in names:
                raise ValueError("word_document_xml_not_found")
            parts: list[dict[str, Any]] = []
            chunks: list[str] = []
            for name in names:
                text = _extract_xml_text(_read_part(archive, name))
                if not text:
                    continue
                parts.append({"name": name, "chars": len(text)})
                chunks.append(text)
    except zipfile.BadZipFile:
        raise ValueError("invalid_docx_zip") from None

    full_text = "\n\n".join(chunks).strip()
    truncated = len(full_text) > max_chars
    return {
        "text": full_text[:max_chars],
        "char_count": len(full_text),
        "truncated": truncated,
        "parts": parts,
    }


def _docx_extract_text_handler(args: dict[str, Any], **_: Any) -> str:
    try:
        path = _validate_docx_path(args.get("file_path"))
        max_chars = _max_chars(args.get("max_chars"))
        result = _extract_docx(
            path,
            max_chars=max_chars,
            include_headers_footers=_bool(args.get("include_headers_footers"), True),
            include_comments=_bool(args.get("include_comments"), False),
        )
        return _json({
            "ok": True,
            "tool": "docx_extract_text",
            "source": "office-open-xml",
            "file_path": str(path),
            "bytes": path.stat().st_size,
            **result,
        })
    except Exception as error:
        return _json({
            "ok": False,
            "tool": "docx_extract_text",
            "error": str(error),
            "allowed_roots": [str(root) for root in _allowed_roots()],
        })


def register(ctx) -> None:
    ctx.register_tool(
        name="docx_extract_text",
        toolset="file",
        schema=DOCX_EXTRACT_TEXT_SCHEMA,
        handler=_docx_extract_text_handler,
        description="Scoped DOCX/Word text extraction for Hermes Mobile workspace files.",
        emoji="docx",
    )
