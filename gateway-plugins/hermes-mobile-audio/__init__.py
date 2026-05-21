"""Scoped audio transcription for Hermes Mobile Gateway profiles."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any


DEFAULT_ALLOWED_ROOTS = (
    "/mnt/c/ProgramData/HermesMobile/data/drive",
    "/mnt/c/ProgramData/HermesMobile/data/uploads",
    "/mnt/c/ProgramData/HermesMobile/data/artifacts",
)
SUPPORTED_SUFFIXES = {
    ".mp3",
    ".m4a",
    ".mp4",
    ".wav",
    ".aac",
    ".ogg",
    ".opus",
    ".amr",
    ".flac",
    ".webm",
}
MAX_AUDIO_BYTES = 200 * 1024 * 1024
MAX_RETURN_CHARS = 120_000
DEFAULT_RETURN_CHARS = 40_000
TRANSCRIPTION_MODEL = "large-v3-turbo"
TRANSCRIPTION_PROVIDER = "whisper-large-v3-turbo-service"


AUDIO_TRANSCRIBE_SCHEMA = {
    "name": "audio_transcribe",
    "description": (
        "Transcribe an in-scope audio file such as MP3, M4A, WAV, AAC, OGG, OPUS, AMR, "
        "or FLAC using the Hermes Mobile Whisper large v3 turbo runtime. Use this for voice notes, "
        "reading retellings, meeting audio, and other current-workspace audio files. The "
        "file path must stay inside current Hermes Mobile workspace/upload/artifact roots."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "file_path": {
                "type": "string",
                "description": "Absolute path to an audio file inside an allowed Hermes Mobile root.",
            },
            "language": {
                "type": "string",
                "description": (
                    "Optional BCP-47/ISO language hint such as en, zh, zh-CN, or auto. "
                    "Leave empty or use auto for automatic detection."
                ),
                "default": "auto",
            },
            "max_chars": {
                "type": "integer",
                "description": "Maximum transcript characters to return, from 1000 to 120000. Defaults to 40000.",
                "minimum": 1000,
                "maximum": MAX_RETURN_CHARS,
                "default": DEFAULT_RETURN_CHARS,
            },
            "include_segments": {
                "type": "boolean",
                "description": "Include timestamped transcript segments. Defaults to true.",
                "default": True,
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
    for item in _split_env_list("HERMES_MOBILE_AUDIO_ALLOWED_ROOTS", DEFAULT_ALLOWED_ROOTS):
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


def _max_audio_bytes() -> int:
    try:
        value = int(os.environ.get("HERMES_MOBILE_AUDIO_MAX_BYTES", str(MAX_AUDIO_BYTES)))
    except Exception:
        value = MAX_AUDIO_BYTES
    return max(1024 * 1024, min(1024 * 1024 * 1024, value))


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


def _language_hint(value: Any) -> str | None:
    text = str(value or "").strip()
    if not text or text.lower() in {"auto", "detect", "none", "null"}:
        return None
    if text.lower() in {"zh-cn", "zh_cn", "cn", "chinese"}:
        return "zh"
    if text.lower() in {"en-us", "en_gb", "en-gb", "english"}:
        return "en"
    return text


def _validate_audio_path(value: Any) -> Path:
    text = str(value or "").strip()
    if not text:
        raise ValueError("file_path_required")
    path = Path(_platform_path(text)).expanduser()
    if not path.is_absolute():
        raise PermissionError("file_path_must_be_absolute")
    if not _inside_roots(path, _allowed_roots()):
        raise PermissionError("file_path_outside_allowed_roots")
    if path.suffix.lower() not in SUPPORTED_SUFFIXES:
        raise ValueError("unsupported_audio_file_suffix")
    if not path.exists():
        raise FileNotFoundError("file_path_not_found")
    if not path.is_file():
        raise ValueError("file_path_not_file")
    size = path.stat().st_size
    if size > _max_audio_bytes():
        raise ValueError("audio_file_too_large")
    return path.resolve()


def _service_url() -> str:
    return (os.environ.get("HERMES_MOBILE_AUDIO_TRANSCRIBE_URL")
            or os.environ.get("HERMES_READING_TRANSCRIBE_URL")
            or "http://127.0.0.1:8001/v1/audio/transcriptions").strip()


def _transcribe_with_service(path: Path, language: str | None, timeout_seconds: int = 240) -> dict[str, Any]:
    curl = shutil.which("curl") or shutil.which("curl.exe")
    if not curl:
        raise RuntimeError("curl_not_available_for_whisper_large_v3_turbo_service")
    command = [
        curl,
        "-sS",
        "--fail-with-body",
        "--max-time",
        str(max(5, timeout_seconds)),
        "-F",
        f"file=@{path}",
        "-F",
        "response_format=json",
    ]
    if language:
        command.extend(["-F", f"language={language}"])
    command.append(_service_url())
    completed = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace", check=False)
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "").strip()
        raise RuntimeError(f"whisper_large_v3_turbo_service_failed:{completed.returncode}:{detail[:500]}")
    try:
        parsed = json.loads(completed.stdout or "{}")
    except Exception as exc:
        raise RuntimeError(f"invalid_whisper_large_v3_turbo_response:{type(exc).__name__}") from None
    if isinstance(parsed, dict) and parsed.get("error"):
        raise RuntimeError(f"whisper_large_v3_turbo_error:{parsed.get('error')}")
    return parsed if isinstance(parsed, dict) else {}


def _transcribe(path: Path, language: str | None, max_chars: int, include_segments: bool) -> dict[str, Any]:
    parsed = _transcribe_with_service(path, language)
    segment_list = parsed.get("segments") if isinstance(parsed.get("segments"), list) else []
    rows: list[dict[str, Any]] = []
    parts: list[str] = []
    char_count = 0
    truncated = False
    for segment in segment_list:
        if not isinstance(segment, dict):
            continue
        text = str(segment.get("text") or "").strip()
        if not text:
            continue
        if include_segments:
            rows.append({
                "start": round(float(segment.get("start") or 0.0), 2),
                "end": round(float(segment.get("end") or 0.0), 2),
                "text": text,
            })
        add_text = text if not parts else "\n" + text
        if char_count + len(add_text) > max_chars:
            remaining = max(0, max_chars - char_count)
            if remaining:
                parts.append(add_text[:remaining])
            truncated = True
            break
        parts.append(add_text)
        char_count += len(add_text)

    transcript = "".join(parts).strip()
    if not transcript:
        transcript = str(parsed.get("text") or "").strip()[:max_chars]
        truncated = len(str(parsed.get("text") or "")) > max_chars
    return {
        "text": transcript,
        "segments": rows if include_segments else [],
        "language": str(parsed.get("language") or language or ""),
        "duration": round(float(parsed.get("duration") or 0.0), 2),
        "model": TRANSCRIPTION_MODEL,
        "truncated": truncated,
    }


def _audio_transcribe_handler(args: dict[str, Any], **_: Any) -> str:
    try:
        path = _validate_audio_path(args.get("file_path"))
        max_chars = _max_chars(args.get("max_chars"))
        result = _transcribe(
            path,
            language=_language_hint(args.get("language")),
            max_chars=max_chars,
            include_segments=_bool(args.get("include_segments"), True),
        )
        return _json({
            "ok": True,
            "tool": "audio_transcribe",
            "source": TRANSCRIPTION_PROVIDER,
            "file_path": str(path),
            "bytes": path.stat().st_size,
            **result,
        })
    except Exception as error:
        return _json({
            "ok": False,
            "tool": "audio_transcribe",
            "error": str(error),
            "allowed_roots": [str(root) for root in _allowed_roots()],
        })


def register(ctx) -> None:
    ctx.register_tool(
        name="audio_transcribe",
        toolset="file",
        schema=AUDIO_TRANSCRIBE_SCHEMA,
        handler=_audio_transcribe_handler,
        description="Scoped MP3/M4A/WAV voice transcription with Whisper large v3 turbo.",
        emoji="audio",
    )
