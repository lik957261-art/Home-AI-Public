"""Scoped PDF text extraction and page rendering for Hermes Mobile Gateway profiles."""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any


DEFAULT_ALLOWED_ROOTS = (
    "/mnt/c/ProgramData/HermesMobile/data/drive",
    "/mnt/c/ProgramData/HermesMobile/data/uploads",
    "/mnt/c/ProgramData/HermesMobile/data/artifacts",
)
DEFAULT_OUTPUT_ROOTS = (
    "/mnt/c/ProgramData/HermesMobile/data/artifacts",
)
SUPPORTED_SUFFIXES = {".pdf"}
MAX_PDF_BYTES = 200 * 1024 * 1024
MAX_RETURN_CHARS = 200_000
DEFAULT_RETURN_CHARS = 50_000
DEFAULT_MAX_TEXT_PAGES = 80
DEFAULT_RENDER_PAGES = 12
MAX_RENDER_PAGES = 50
DEFAULT_RENDER_SCALE = 2.0
SCRIPT_TIMEOUT_SECONDS = 120


PDF_EXTRACT_TEXT_SCHEMA = {
    "name": "pdf_extract_text",
    "description": (
        "Extract readable embedded text from an in-scope PDF file. Use this for PDF reports before "
        "claiming that a PDF has no text layer. If the result has hasTextLayer=false or empty text, "
        "call pdf_render_pages and pass the generated page images to vision/OCR instead of asking "
        "the user to export screenshots manually."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "file_path": {
                "type": "string",
                "description": "Path to a .pdf file inside an allowed Hermes Mobile root.",
            },
            "max_pages": {
                "type": "integer",
                "description": "Maximum pages to inspect for text. Defaults to 80.",
                "minimum": 1,
                "maximum": 500,
                "default": DEFAULT_MAX_TEXT_PAGES,
            },
            "max_chars": {
                "type": "integer",
                "description": "Maximum extracted characters to return, from 1000 to 200000. Defaults to 50000.",
                "minimum": 1000,
                "maximum": MAX_RETURN_CHARS,
                "default": DEFAULT_RETURN_CHARS,
            },
        },
        "required": ["file_path"],
    },
}


PDF_RENDER_PAGES_SCHEMA = {
    "name": "pdf_render_pages",
    "description": (
        "Render pages from an in-scope PDF into PNG files under an allowed Hermes Mobile artifact "
        "root. Use this when pdf_extract_text reports no text layer, or when a scanned/image PDF "
        "needs visual OCR. The returned image paths are suitable for the vision tool."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "file_path": {
                "type": "string",
                "description": "Path to a .pdf file inside an allowed Hermes Mobile root.",
            },
            "start_page": {
                "type": "integer",
                "description": "1-based first page to render. Defaults to 1.",
                "minimum": 1,
                "default": 1,
            },
            "max_pages": {
                "type": "integer",
                "description": "Maximum pages to render. Defaults to 12; maximum 50.",
                "minimum": 1,
                "maximum": MAX_RENDER_PAGES,
                "default": DEFAULT_RENDER_PAGES,
            },
            "scale": {
                "type": "number",
                "description": "PDF point to pixel scale. Defaults to 2.0 and is clamped from 0.5 to 4.0.",
                "minimum": 0.5,
                "maximum": 4.0,
                "default": DEFAULT_RENDER_SCALE,
            },
            "output_dir": {
                "type": "string",
                "description": "Optional output directory inside an allowed Hermes Mobile artifact root.",
            },
        },
        "required": ["file_path"],
    },
}


PDF_CREATE_SCHEMA = {
    "name": "pdf_create",
    "description": (
        "Create a real PDF report from structured Markdown or plain text inside an allowed Hermes "
        "Mobile artifact root. Use this when the user asks for a PDF deliverable, including health "
        "reports, medication instructions, ECG summaries, or checkup整理. Return the MEDIA path from "
        "the tool result instead of only returning Markdown."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "markdown": {
                "type": "string",
                "description": "Structured Markdown content to render into a PDF. Prefer this for report-like output.",
            },
            "text": {
                "type": "string",
                "description": "Plain text content to render into a PDF when Markdown is not available.",
            },
            "title": {
                "type": "string",
                "description": "Optional report title used for the generated file name and document heading.",
            },
            "output_path": {
                "type": "string",
                "description": "Optional absolute .pdf output path inside an allowed Hermes Mobile artifact root.",
            },
            "output_dir": {
                "type": "string",
                "description": "Optional absolute output directory inside an allowed Hermes Mobile artifact root.",
            },
            "overwrite": {
                "type": "boolean",
                "description": "Whether to replace an existing output_path. Defaults to false.",
                "default": False,
            },
        },
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


def _roots(env_name: str, defaults: tuple[str, ...]) -> list[Path]:
    roots: list[Path] = []
    for item in _split_env_list(env_name, defaults):
        try:
            roots.append(Path(_platform_path(item)).resolve())
        except Exception:
            continue
    return roots


def _allowed_roots() -> list[Path]:
    return _roots("HERMES_MOBILE_PDF_ALLOWED_ROOTS", DEFAULT_ALLOWED_ROOTS)


def _output_roots() -> list[Path]:
    return _roots("HERMES_MOBILE_PDF_OUTPUT_ROOTS", DEFAULT_OUTPUT_ROOTS)


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


def _max_pdf_bytes() -> int:
    try:
        value = int(os.environ.get("HERMES_MOBILE_PDF_MAX_BYTES", str(MAX_PDF_BYTES)))
    except Exception:
        value = MAX_PDF_BYTES
    return max(1024 * 1024, min(1024 * 1024 * 1024, value))


def _bounded_int(value: Any, fallback: int, min_value: int, max_value: int) -> int:
    try:
        number = int(value)
    except Exception:
        number = fallback
    return max(min_value, min(max_value, number))


def _bounded_float(value: Any, fallback: float, min_value: float, max_value: float) -> float:
    try:
        number = float(value)
    except Exception:
        number = fallback
    if number != number:
        number = fallback
    return max(min_value, min(max_value, number))


def _text_content(args: dict[str, Any]) -> str:
    markdown = str(args.get("markdown") or "").strip()
    text = str(args.get("text") or "").strip()
    source = markdown or text
    if not source:
        raise ValueError("content_required")
    source = source.replace("\r\n", "\n").replace("\r", "\n")
    source = re.sub(r"```[\w-]*\n", "", source)
    source = source.replace("```", "")
    source = re.sub(r"^\s{0,3}#{1,6}\s*", "", source, flags=re.MULTILINE)
    source = re.sub(r"^\s{0,3}[-*+]\s+", "- ", source, flags=re.MULTILINE)
    source = re.sub(r"\n{4,}", "\n\n\n", source)
    return source.strip()


def _validate_output_path(value: Any, output_dir_value: Any, title: str, suffix: str) -> Path:
    text = str(value or "").strip()
    if text:
        destination = Path(_platform_path(text)).expanduser()
    else:
        roots = _output_roots()
        if not roots:
            raise PermissionError("pdf_output_root_missing")
        output_dir_text = str(output_dir_value or "").strip()
        output_dir = Path(_platform_path(output_dir_text)).expanduser() if output_dir_text else roots[0] / "documents"
        if not output_dir.is_absolute():
            raise PermissionError("output_dir_must_be_absolute")
        if not _inside_roots(output_dir, roots):
            raise PermissionError("output_dir_outside_allowed_roots")
        digest = hashlib.sha256(f"{title}:{time.time_ns()}".encode("utf-8", "ignore")).hexdigest()[:10]
        destination = output_dir / f"{_safe_slug(title or 'report')}-{digest}{suffix}"
    if not destination.is_absolute():
        raise PermissionError("output_path_must_be_absolute")
    if destination.suffix.lower() != suffix:
        raise ValueError(f"output_path_must_end_with_{suffix[1:]}")
    roots = _output_roots()
    if not roots or not _inside_roots(destination, roots):
        raise PermissionError("output_path_outside_allowed_roots")
    return destination.resolve()


def _create_pdf(path: Path, content: str, overwrite: bool) -> dict[str, Any]:
    if path.exists() and not overwrite:
        raise FileExistsError("output_path_exists")
    cupsfilter = _command("HERMES_MOBILE_CUPSFILTER_COMMAND", "/usr/sbin/cupsfilter")
    if not shutil.which(cupsfilter) and not Path(cupsfilter).exists():
        return {"ok": False, "error": "pdf_creator_unavailable"}
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="homeai-pdf-create-", dir=str(path.parent)) as tmp:
        text_path = Path(tmp) / "input.txt"
        text_path.write_text(content, encoding="utf-8")
        with path.open("wb") as output:
            completed = subprocess.run(
                [cupsfilter, "-m", "application/pdf", str(text_path)],
                stdout=output,
                stderr=subprocess.PIPE,
                text=True,
                timeout=SCRIPT_TIMEOUT_SECONDS,
                check=False,
            )
    if completed.returncode != 0:
        try:
            path.unlink(missing_ok=True)
        except Exception:
            pass
        return {"ok": False, "error": "pdf_create_failed"}
    if not path.exists() or path.stat().st_size <= 0:
        return {"ok": False, "error": "pdf_create_empty_output"}
    return {"ok": True, "path": str(path), "bytes": path.stat().st_size}


def _validate_pdf_path(value: Any) -> Path:
    text = str(value or "").strip()
    if not text:
        raise ValueError("file_path_required")
    path = Path(_platform_path(text)).expanduser()
    if not path.is_absolute():
        raise PermissionError("file_path_must_be_absolute")
    if not _inside_roots(path, _allowed_roots()):
        raise PermissionError("file_path_outside_allowed_roots")
    if path.suffix.lower() not in SUPPORTED_SUFFIXES:
        raise ValueError("unsupported_pdf_file_suffix")
    if not path.exists():
        raise FileNotFoundError("file_path_not_found")
    if not path.is_file():
        raise ValueError("file_path_not_file")
    size = path.stat().st_size
    if size > _max_pdf_bytes():
        raise ValueError("pdf_file_too_large")
    return path.resolve()


def _safe_slug(value: str) -> str:
    text = re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip(".-")
    return text[:80] or "pdf"


def _default_output_dir(path: Path) -> Path:
    roots = _output_roots()
    if not roots:
        raise PermissionError("pdf_output_root_missing")
    stat = path.stat()
    material = f"{path}:{stat.st_size}:{stat.st_mtime_ns}:{time.time_ns()}".encode("utf-8", "ignore")
    digest = hashlib.sha256(material).hexdigest()[:12]
    return roots[0] / "pdf-pages" / f"{_safe_slug(path.stem)}-{digest}"


def _validate_output_dir(value: Any, pdf_path: Path) -> Path:
    text = str(value or "").strip()
    destination = Path(_platform_path(text)).expanduser() if text else _default_output_dir(pdf_path)
    if not destination.is_absolute():
        raise PermissionError("output_dir_must_be_absolute")
    roots = _output_roots()
    if not roots or not _inside_roots(destination, roots):
        raise PermissionError("output_dir_outside_allowed_roots")
    if destination.exists() and any(destination.iterdir()):
        raise FileExistsError("output_dir_must_be_empty")
    return destination.resolve()


def _helper_path(name: str) -> Path:
    return Path(__file__).resolve().parent / name


def _command(name: str, fallback: str) -> str:
    override = os.environ.get(name, "").strip()
    if override:
        return override
    return fallback


def _run_json(command: list[str], stdin_payload: dict[str, Any] | None = None) -> dict[str, Any]:
    try:
        completed = subprocess.run(
            command,
            input=json.dumps(stdin_payload or {}, ensure_ascii=False) if stdin_payload is not None else None,
            text=True,
            capture_output=True,
            timeout=SCRIPT_TIMEOUT_SECONDS,
            check=False,
        )
    except FileNotFoundError:
        return {"ok": False, "error": "pdf_helper_command_not_found"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "pdf_helper_timeout"}

    stdout = (completed.stdout or "").strip()
    if stdout:
        try:
            return json.loads(stdout)
        except Exception:
            return {"ok": False, "error": "pdf_helper_invalid_json"}
    return {"ok": False, "error": f"pdf_helper_exit_{completed.returncode}"}


def _extract_text(path: Path, max_pages: int, max_chars: int) -> dict[str, Any]:
    node = _command("HERMES_MOBILE_NODE_COMMAND", "node")
    helper = _helper_path("pdf_extract_text.mjs")
    return _run_json(
        [node, str(helper)],
        {"file_path": str(path), "max_pages": max_pages, "max_chars": max_chars},
    )


def _render_pages(path: Path, output_dir: Path, start_page: int, max_pages: int, scale: float) -> dict[str, Any]:
    swift = _command("HERMES_MOBILE_SWIFT_COMMAND", "/usr/bin/swift")
    if not shutil.which(swift) and not Path(swift).exists():
        return {"ok": False, "error": "pdf_renderer_unavailable"}
    helper = _helper_path("render_pdf_pages.swift")
    return _run_json([
        swift,
        str(helper),
        str(path),
        str(output_dir),
        str(start_page),
        str(max_pages),
        str(scale),
    ])


def _pdf_extract_text_handler(args: dict[str, Any], **_: Any) -> str:
    try:
        path = _validate_pdf_path(args.get("file_path"))
        max_pages = _bounded_int(args.get("max_pages"), DEFAULT_MAX_TEXT_PAGES, 1, 500)
        max_chars = _bounded_int(args.get("max_chars"), DEFAULT_RETURN_CHARS, 1000, MAX_RETURN_CHARS)
        result = _extract_text(path, max_pages=max_pages, max_chars=max_chars)
        if not result.get("ok"):
            return _json({"ok": False, "tool": "pdf_extract_text", "error": result.get("error") or "pdf_extract_text_failed"})
        return _json({
            "ok": True,
            "tool": "pdf_extract_text",
            "fileName": path.name,
            "bytes": path.stat().st_size,
            **result,
        })
    except Exception as error:
        return _json({
            "ok": False,
            "tool": "pdf_extract_text",
            "error": str(error),
        })


def _pdf_render_pages_handler(args: dict[str, Any], **_: Any) -> str:
    try:
        path = _validate_pdf_path(args.get("file_path"))
        output_dir = _validate_output_dir(args.get("output_dir"), path)
        start_page = _bounded_int(args.get("start_page"), 1, 1, 100000)
        max_pages = _bounded_int(args.get("max_pages"), DEFAULT_RENDER_PAGES, 1, MAX_RENDER_PAGES)
        scale = _bounded_float(args.get("scale"), DEFAULT_RENDER_SCALE, 0.5, 4.0)
        result = _render_pages(path, output_dir=output_dir, start_page=start_page, max_pages=max_pages, scale=scale)
        if not result.get("ok"):
            return _json({"ok": False, "tool": "pdf_render_pages", "error": result.get("error") or "pdf_render_pages_failed"})
        image_paths = [str(page.get("path") or "") for page in result.get("pages") or [] if page.get("path")]
        return _json({
            "ok": True,
            "tool": "pdf_render_pages",
            "fileName": path.name,
            "bytes": path.stat().st_size,
            "imagePaths": image_paths,
            **result,
        })
    except Exception as error:
        return _json({
            "ok": False,
            "tool": "pdf_render_pages",
            "error": str(error),
        })


def _pdf_create_handler(args: dict[str, Any], **_: Any) -> str:
    try:
        title = str(args.get("title") or "report").strip() or "report"
        content = _text_content(args)
        output_path = _validate_output_path(args.get("output_path"), args.get("output_dir"), title, ".pdf")
        overwrite = bool(args.get("overwrite") is True)
        result = _create_pdf(output_path, content, overwrite=overwrite)
        if not result.get("ok"):
            return _json({"ok": False, "tool": "pdf_create", "error": result.get("error") or "pdf_create_failed"})
        return _json({
            "ok": True,
            "tool": "pdf_create",
            "fileName": output_path.name,
            "media": f"MEDIA:{output_path}",
            **result,
        })
    except Exception as error:
        return _json({
            "ok": False,
            "tool": "pdf_create",
            "error": str(error),
        })


def register(ctx) -> None:
    ctx.register_tool(
        name="pdf_create",
        toolset="file",
        schema=PDF_CREATE_SCHEMA,
        handler=_pdf_create_handler,
        description="Scoped PDF report generation for Hermes Mobile workspace files.",
        emoji="pdf",
    )
    ctx.register_tool(
        name="pdf_extract_text",
        toolset="file",
        schema=PDF_EXTRACT_TEXT_SCHEMA,
        handler=_pdf_extract_text_handler,
        description="Scoped PDF text extraction for Hermes Mobile workspace files.",
        emoji="pdf",
    )
    ctx.register_tool(
        name="pdf_render_pages",
        toolset="file",
        schema=PDF_RENDER_PAGES_SCHEMA,
        handler=_pdf_render_pages_handler,
        description="Scoped PDF page rendering for Hermes Mobile workspace files.",
        emoji="pdf",
    )
